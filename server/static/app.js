const app = {
    ws: null,
    currentEpisodeId: null,
    currentTask: null,
    terminalActiveLine: null,
    typewriterTimeout: null,
    isAutoTraining: false,
    metrics: { count: 0, sumReward: 0 },
    scrollPending: false,

    init: function() {
        this.connectWS();
        this.initVisuals();
        this.loadSettings();
    },

    connectWS: function() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
        
        this.ws.onopen = () => {
            document.getElementById('status-indicator').classList.add('connected');
            document.getElementById('status-text').textContent = 'API Live';
            this.terminalPrint("OpenEnv API connection established.");
        };
        
        this.ws.onclose = () => {
            document.getElementById('status-indicator').classList.remove('connected');
            document.getElementById('status-text').textContent = 'Link Lost';
            setTimeout(() => this.connectWS(), 3000);
        };
        
        this.ws.onmessage = (e) => {
            const data = JSON.parse(e.data);
            if (data.type === 'reset') {
                this.handleReset(data.observation);
            } else if (data.type === 'stream') {
                this.handleStreamChunk(data.content);
            } else if (data.type === 'step') {
                this.handleStep(data.result);
            } else if (data.type === 'error') {
                this.terminalPrint(`[ERROR] ${data.message}`);
                alert('Error: ' + data.message);
            }
        };
    },

    // ===== SIDEBAR =====
    toggleSidebar: function() {
        const sidebar = document.getElementById('sidebar');
        sidebar.classList.toggle('open');
    },

    setActiveNav: function(taskId) {
        document.querySelectorAll('.nav-item[data-task]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.task === taskId);
        });
    },

    // ===== EPISODES =====
    startEpisode: function(taskId) {
        this.currentTask = taskId;
        this.setActiveNav(taskId);

        // Update breadcrumb
        const labels = { easy: 'Easy (Detect)', medium: 'Medium (Action)', hard: 'Hard (Appeal)' };
        document.getElementById('breadcrumb-task').textContent = labels[taskId] || taskId;

        // Close sidebar on mobile
        document.getElementById('sidebar').classList.remove('open');

        const config = JSON.parse(sessionStorage.getItem('env_config') || '{}');
        this.ws.send(JSON.stringify({ 
            action: "reset", 
            task_id: taskId,
            config: config 
        }));
        
        document.getElementById('landing-page').style.display = 'none';
        document.getElementById('main-interface').style.display = 'flex';
        document.getElementById('reward-overlay').style.display = 'none';
        
        // Reset Terminal
        document.getElementById('terminal-output').innerHTML = '';
        this.terminalPrint(`> Env reset requested. Task: ${taskId.toUpperCase()}`);
    },

    handleReset: function(obs) {
        this.currentEpisodeId = obs.episode_id;
        const c = obs.content_case;
        const b = obs.policy_briefing;
        const r = obs.global_risk;
        
        // Policy Briefing
        const banner = document.getElementById('policy-alert-banner');
        document.getElementById('alert-level').textContent = b.alert_level.toUpperCase();
        document.getElementById('alert-topic').textContent = b.current_focus;
        document.getElementById('alert-summary').textContent = b.guidance_summary;
        banner.className = 'alert-banner box-glow ' + b.alert_level.toLowerCase();

        // Risk Metrics
        document.getElementById('val-queue-depth').textContent = r.queue_depth;
        document.getElementById('val-avg-harm').textContent = r.avg_harm_potential;

        document.getElementById('current-task-badge').textContent = obs.task_name;
        document.getElementById('val-post-id').textContent = c.post_id;
        document.getElementById('val-platform').textContent = c.platform;
        document.getElementById('val-user-age').textContent = c.user_account.account_age_days;
        document.getElementById('val-prior-violations').textContent = c.user_account.prior_violations;
        document.getElementById('val-reports').textContent = c.engagement.reports_received;

        this.typeWriterEffect('val-content', `"${c.content}"`, 15);
        this.renderActionForm(obs.action_space);
        this.terminalPrint(`> Env context initialized. Operational Status: ${b.alert_level}`);
    },

    renderActionForm: function(space) {
        const panel = document.getElementById('action-panel');
        let html = '';
        
        for (const [key, prop] of Object.entries(space.properties)) {
            html += `<div class="form-group"><label>${key.replace(/_/g, ' ')}</label>`;
            if (prop.enum) {
                html += `<select id="input-${key}">`;
                prop.enum.forEach(val => html += `<option value="${val}">${val}</option>`);
                html += `</select>`;
            } else if (prop.type === 'string') {
                html += `<input type="text" id="input-${key}" placeholder="${prop.description || ''}">`;
            } else if (prop.type === 'integer') {
                html += `<input type="number" id="input-${key}" min="${prop.minimum||1}" max="${prop.maximum||5}" value="${prop.minimum||1}">`;
            } else if (prop.type === 'array') {
                html += `<input type="text" id="input-${key}" placeholder="Comma separated values">`;
            }
            html += `</div>`;
        }
        
        html += `<button class="btn btn-outline w-full" style="margin-top: 0.5rem;" onclick="app.submitAction()"><i class="fa-solid fa-check"></i> Manual Commit</button>`;
        panel.innerHTML = html;
    },

    submitAction: function() {
        const payload = {};
        const inputs = document.querySelectorAll('[id^="input-"]');
        inputs.forEach(input => {
            const key = input.id.replace('input-', '');
            let val = input.value;
            if (input.type === 'number') val = parseInt(val, 10);
            if (key === 'policy_references' || key === 'diagnoses' || input.placeholder === 'Comma separated values') {
                val = val ? val.split(',').map(s => s.trim()) : [];
            }
            payload[key] = val;
        });

        this.terminalPrint(`> Step submitted manually.\nPayload: ${JSON.stringify(payload)}`);
        this.ws.send(JSON.stringify({ action: "step", data: payload }));
    },
    
    // ===== AUTO TRAINING =====
    toggleAutoLoop: function() {
        this.isAutoTraining = !this.isAutoTraining;
        const btn = document.getElementById('btn-auto-loop');
        if (this.isAutoTraining) {
            btn.innerHTML = '<i class="fa-solid fa-stop"></i> Stop Training Loop';
            btn.style.background = 'var(--danger)';
            btn.style.boxShadow = '0 4px 15px var(--danger-glow)';
            this.runAgent(true);
        } else {
            btn.innerHTML = '<i class="fa-solid fa-infinity"></i> Start Auto-Training Loop';
            btn.style.background = '';
            btn.style.boxShadow = '';
            this.terminalPrint(`> [SYSTEM] Training Loop Halted by User.`);
        }
    },
    
    runAgent: function(isLooping) {
        this.terminalPrint(`> Autonomous agent invoked.`);
        
        const term = document.getElementById('terminal-output');
        this.terminalActiveLine = document.createElement('div');
        this.terminalActiveLine.className = 'log-line running';
        term.appendChild(this.terminalActiveLine);
        
        document.getElementById('btn-run-agent').disabled = true;
        document.getElementById('btn-run-agent').style.opacity = '0.5';
        document.getElementById('btn-auto-loop').disabled = true;
        
        this.ws.send(JSON.stringify({ action: "run_agent" }));
    },
    
    handleStreamChunk: function(content) {
        if (!this.terminalActiveLine) {
            const term = document.getElementById('terminal-output');
            this.terminalActiveLine = document.createElement('div');
            this.terminalActiveLine.className = 'log-line running';
            term.appendChild(this.terminalActiveLine);
        }
        
        this.terminalActiveLine.textContent += content;
        
        if (!this.scrollPending) {
            this.scrollPending = true;
            requestAnimationFrame(() => {
                const term = document.getElementById('terminal-output');
                term.scrollTop = term.scrollHeight;
                this.scrollPending = false;
            });
        }
    },

    handleStep: function(result) {
        if (this.terminalActiveLine) {
            this.terminalActiveLine.classList.remove('running');
            this.terminalActiveLine = null;
        }

        const rw = result.reward;
        const rc = document.getElementById('reward-display');
        rc.textContent = rw.toFixed(2);
        
        let color = 'var(--danger)';
        let shadow = 'rgba(244, 63, 94, 0.5)';
        if (rw >= 0.8) { color = 'var(--success)'; shadow = 'rgba(16, 185, 129, 0.5)'; }
        else if (rw >= 0.4) { color = 'var(--warning)'; shadow = 'rgba(251, 191, 36, 0.5)'; }
        
        rc.style.borderColor = color;
        rc.style.color = color;
        rc.style.boxShadow = `0 0 30px ${shadow}`;

        document.getElementById('feedback-display').textContent = result.info.feedback;
        document.getElementById('reward-overlay').style.display = 'flex';
        
        document.getElementById('btn-run-agent').disabled = false;
        document.getElementById('btn-run-agent').style.opacity = '1';
        document.getElementById('btn-auto-loop').disabled = false;
        
        this.terminalPrint('');
        this.terminalPrint(`=== OPENENV GRADER METRICS ===`);
        this.terminalPrint(`> Final Score: ${(rw * 100).toFixed(1)}%`);
        this.terminalPrint(`> Evaluated Task: ${this.currentTask.toUpperCase()}`);
        this.terminalPrint(`> Policy Rationale: ${result.info.ground_truth_reasoning}`);
        this.terminalPrint(`> Ground Truth Expected: ${JSON.stringify(result.info.ground_truth)}`);
        this.terminalPrint(`> System Feedback: ${result.info.feedback}`);
        this.terminalPrint(`==============================`);
        this.terminalPrint('');
        
        // Update HUD
        this.metrics.count++;
        this.metrics.sumReward += rw;
        document.getElementById('hud-episodes').textContent = this.metrics.count;
        document.getElementById('hud-accuracy').textContent = ((this.metrics.sumReward / this.metrics.count) * 100).toFixed(1) + '%';
        
        if (this.isAutoTraining) {
            this.terminalPrint(`> [LOOP] Waiting 2s before initiating next cycle...`);
            setTimeout(() => {
                if (this.isAutoTraining) {
                    this.closeReward(true);
                    setTimeout(() => {
                        if (this.isAutoTraining) this.runAgent(true);
                    }, 500);
                }
            }, 2000);
        }
    },
    
    closeReward: function(triggerNext) {
        document.getElementById('reward-overlay').style.display = 'none';
        document.getElementById('terminal-output').innerHTML = '';
        if (triggerNext && this.currentTask) this.startEpisode(this.currentTask);
    },

    clearTerminal: function() {
        document.getElementById('terminal-output').innerHTML = '';
        this.terminalPrint('> Terminal cleared.');
    },
    
    terminalPrint: function(msg) {
        if (this.terminalActiveLine) {
            this.terminalActiveLine.classList.remove('running');
            this.terminalActiveLine = null;
        }
        const term = document.getElementById('terminal-output');
        const line = document.createElement('div');
        line.className = 'log-line';
        line.textContent = msg;
        term.appendChild(line);
        
        while (term.children.length > 50) {
            term.removeChild(term.firstChild);
        }
        
        term.scrollTop = term.scrollHeight;
    },
    
    typeWriterEffect: function(elemId, text, speed) {
        if (this.typewriterTimeout) {
            clearTimeout(this.typewriterTimeout);
            this.typewriterTimeout = null;
        }
        
        const el = document.getElementById(elemId);
        el.textContent = '';
        let i = 0;
        const appRef = this;
        function type() {
            if (i < text.length) {
                el.textContent += text.charAt(i);
                i++;
                appRef.typewriterTimeout = setTimeout(type, speed);
            }
        }
        type();
    },

    // ===== VISUALS =====
    initVisuals: function() {
        const canvas = document.getElementById('fluid-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let width = canvas.width = window.innerWidth;
        let height = canvas.height = window.innerHeight;
        const particles = [];
        const numParticles = 60;

        window.addEventListener('resize', () => {
            width = canvas.width = window.innerWidth;
            height = canvas.height = window.innerHeight;
        });

        for (let i = 0; i < numParticles; i++) {
            particles.push({
                x: Math.random() * width,
                y: Math.random() * height,
                vx: (Math.random() - 0.5) * 0.4,
                vy: (Math.random() - 0.5) * 0.4,
                radius: Math.random() * 1.8 + 0.8,
                color: Math.random() > 0.6
                    ? 'rgba(99, 102, 241, 0.35)'
                    : Math.random() > 0.3
                        ? 'rgba(16, 185, 129, 0.25)'
                        : 'rgba(139, 92, 246, 0.2)'
            });
        }

        function draw() {
            ctx.clearRect(0, 0, width, height);
            
            particles.forEach(p => {
                p.x += p.vx;
                p.y += p.vy;
                if (p.x < 0 || p.x > width) p.vx *= -1;
                if (p.y < 0 || p.y > height) p.vy *= -1;
                
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.fillStyle = p.color;
                ctx.fill();
            });

            for (let i = 0; i < particles.length; i++) {
                for (let j = i + 1; j < particles.length; j++) {
                    const dx = particles[i].x - particles[j].x;
                    const dy = particles[i].y - particles[j].y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    
                    if (dist < 140) {
                        ctx.beginPath();
                        ctx.strokeStyle = `rgba(255, 255, 255, ${0.06 - dist / 2500})`;
                        ctx.lineWidth = 0.5;
                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(particles[j].x, particles[j].y);
                        ctx.stroke();
                    }
                }
            }
            requestAnimationFrame(draw);
        }
        draw();
    },

    // ===== SETTINGS =====
    toggleSettings: function() {
        const modal = document.getElementById('settings-modal');
        modal.style.display = modal.style.display === 'none' ? 'flex' : 'none';
        if (modal.style.display === 'flex') this.loadSettings();
    },

    saveSettings: function() {
        const apiKey = document.getElementById('cfg-api-key').value;
        const baseUrl = document.getElementById('cfg-base-url').value;
        const model = document.getElementById('cfg-model').value;

        if (apiKey.startsWith('hf_') && (!baseUrl || baseUrl.includes('openai.com'))) {
            if (confirm("Detected Hugging Face Token but OpenAI endpoint. Auto-switch to Hugging Face Inference API?")) {
                document.getElementById('cfg-base-url').value = "https://api-inference.huggingface.co/v1";
                if (!model) document.getElementById('cfg-model').value = "meta-llama/Llama-3-70b-instruct";
                return;
            }
        }

        const config = {
            api_key: apiKey,
            base_url: document.getElementById('cfg-base-url').value,
            model: document.getElementById('cfg-model').value
        };
        sessionStorage.setItem('env_config', JSON.stringify(config));
        this.terminalPrint("> [SYSTEM] Developer Credentials Activated.");
        this.toggleSettings();
    },

    clearSettings: function() {
        sessionStorage.removeItem('env_config');
        document.getElementById('cfg-api-key').value = '';
        document.getElementById('cfg-base-url').value = '';
        document.getElementById('cfg-model').value = '';
        this.terminalPrint("> [SYSTEM] Credentials Cleared. Reverting to Platform Default.");
    },

    loadSettings: function() {
        const config = JSON.parse(sessionStorage.getItem('env_config') || '{}');
        if (config.api_key) document.getElementById('cfg-api-key').value = config.api_key;
        if (config.base_url) document.getElementById('cfg-base-url').value = config.base_url;
        if (config.model) document.getElementById('cfg-model').value = config.model;
    }
};

window.onload = () => app.init();
