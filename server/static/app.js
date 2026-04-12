/**
 * THE VAULT (v4.1) — High-Fidelity UX Engine
 * Senior-level logic synchronization for ContentGuardEnv.
 */

const app = {
    ws: null,
    currentEpisodeId: null,
    currentTask: null,
    terminalActiveLine: null,
    typewriterTimeout: null,
    isAutoTraining: false,
    autoRunAfterReset: false,
    episodeDone: false,
    metrics: { count: 0, sumReward: 0 },
    scrollPending: false,

    init: function() {
        // Orchestrate the "Breathe-in" Sequence
        this.connectWS();
        this.initVisuals();
        this.loadSettings();
        
        // Add staggered fade-in classes to UI blocks
        document.querySelectorAll('.sidebar, .topbar, .card').forEach((el, i) => {
            el.style.opacity = '0';
            setTimeout(() => {
                el.style.transition = 'opacity 0.8s var(--ease-out), transform 0.8s var(--ease-out)';
                el.style.opacity = '1';
                el.style.transform = 'translateY(0)';
            }, 100 * i);
        });
    },

    connectWS: function() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
        
        this.ws.onopen = () => {
            const ind = document.getElementById('status-indicator');
            const txt = document.getElementById('status-text');
            if (ind) ind.classList.add('connected');
            if (txt) txt.textContent = 'LINK ACTIVE';
            this.terminalPrint("SYSTEM: ContentGuard Secure Encryption Handshake Verified.");
        };
        
        this.ws.onclose = () => {
            const ind = document.getElementById('status-indicator');
            const txt = document.getElementById('status-text');
            if (ind) ind.classList.remove('connected');
            if (txt) txt.textContent = 'LINK DISCONNECTED';
            this.terminalPrint("WARNING: Secure link severed. Attempting heartbeat reconnect...");
            setTimeout(() => this.connectWS(), 3000);
        };
        
        this.ws.onmessage = (e) => {
            let data;
            try {
                data = JSON.parse(e.data);
            } catch (_) {
                this.terminalPrint('[ALERT] Invalid telemetry packet received from gateway.');
                return;
            }

            if (data.type === 'reset') {
                this.handleReset(data.observation);
            } else if (data.type === 'stream') {
                this.handleStreamChunk(data.content);
            } else if (data.type === 'step') {
                this.handleStep(data.result);
            } else if (data.type === 'error') {
                this.handleServerError(data.message || 'Unspecified gateway error.');
            }
        };
    },

    // ===== OPERATIONAL FLOW =====
    startEpisode: function(taskId) {
        this.currentTask = taskId;
        this.autoRunAfterReset = false;
        this.episodeDone = false;
        this.currentEpisodeId = null;
        
        // Update Sidebar States
        document.querySelectorAll('.nav-item[data-task]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.task === taskId);
        });

        // Update Workspace Context
        const labels = { easy: 'Tier I: Detection', medium: 'Tier II: Action', hard: 'Tier III: Adjudication' };
        document.getElementById('breadcrumb-task').textContent = labels[taskId] || taskId;

        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.terminalPrint('WARNING: Gateway link is not ready. Wait for LINK ACTIVE before starting.');
            return;
        }

        this.setAgentButtonsIdle();

        const config = JSON.parse(sessionStorage.getItem('env_config') || '{}');
        this.ws.send(JSON.stringify({ 
            action: "reset", 
            task_id: taskId,
            config: config 
        }));
        
        // Interface Transition
        document.getElementById('landing-page').style.display = 'none';
        document.getElementById('main-interface').style.display = 'grid'; // Grid for Hub layout
        document.getElementById('reward-overlay').style.display = 'none';
        
        this.terminalPrint(`\nLOG: Resetting Environment. Module: ${taskId.toUpperCase()}`);
    },

    handleReset: function(obs) {
        this.currentEpisodeId = obs.episode_id;
        this.episodeDone = false;
        const c = obs.content_case;
        const b = obs.policy_briefing;

        // Banner Status
        const banner = document.getElementById('policy-alert-banner');
        document.getElementById('alert-level').textContent = b.alert_level.toUpperCase();
        document.getElementById('alert-topic').textContent = b.current_focus;
        document.getElementById('alert-summary').textContent = b.guidance_summary;
        
        // Map alert levels to colors
        const level = b.alert_level.toLowerCase();
        banner.style.borderLeftColor = level === 'critical' ? 'var(--danger)' : 
                                      level === 'elevated' ? '#f97316' : 
                                      level === 'yellow' ? 'var(--warning)' : 'var(--indigo-500)';

        // Metadata Pulse
        this.updateMetric('val-post-id', c.post_id);
        this.updateMetric('val-platform', c.platform);
        this.updateMetric('val-user-age', `${c.user_account.account_age_days}d`);
        this.updateMetric('val-prior-violations', c.user_account.prior_violations);
        this.updateMetric('val-reports', c.engagement.reports_received);

        this.typeWriterEffect('val-content', `"${c.content}"`, 10);
        this.renderActionForm(obs.action_space);
        this.terminalPrint(`INFO: Ingesting context payload. Case ID: ${c.post_id}`);

        if (this.autoRunAfterReset && this.isAutoTraining) {
            this.autoRunAfterReset = false;
            setTimeout(() => {
                if (this.isAutoTraining) this.runAgent(true);
            }, 180);
        }
    },

    updateMetric: function(id, val) {
        const el = document.getElementById(id);
        if (!el) return;
        el.style.transition = 'none';
        el.style.color = 'var(--indigo-500)';
        el.textContent = val;
        setTimeout(() => {
            el.style.transition = 'color 1s var(--ease-out)';
            el.style.color = '';
        }, 100);
    },

    renderActionForm: function(space) {
        const panel = document.getElementById('action-panel');
        let html = '<div class="stat-grid">';
        
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
            }
            html += `</div>`;
        }
        
        html += `</div>`;
        html += `<button class="btn btn-secondary" onclick="app.submitAction()" style="margin-top: 16px;"><i class="fa-solid fa-code-commit"></i> Process Ruling</button>`;
        panel.innerHTML = html;
    },

    submitAction: function() {
        if (!this.currentEpisodeId || this.episodeDone) {
            this.terminalPrint('NOTICE: Active episode required. Start a tier to submit a ruling.');
            return;
        }
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.terminalPrint('WARNING: Gateway link is not ready.');
            return;
        }

        const payload = {};
        const inputs = document.querySelectorAll('[id^="input-"]');
        inputs.forEach(input => {
            const key = input.id.replace('input-', '');
            let val = input.value;
            if (input.type === 'number') val = parseInt(val, 10);
            payload[key] = val;
        });

        this.terminalPrint(`LOG: External ruling override received. Processing payload...`);
        this.ws.send(JSON.stringify({ action: "step", data: payload }));
    },
    
    // ===== AUTONOMOUS EXECUTION =====
    toggleAutoLoop: function() {
        this.isAutoTraining = !this.isAutoTraining;
        const btn = document.getElementById('btn-auto-loop');
        if (this.isAutoTraining) {
            btn.innerHTML = '<i class="fa-solid fa-stop"></i> Terminate Loop';
            btn.style.background = 'var(--zinc-50)';
            btn.style.color = 'var(--zinc-950)';

            if (!this.currentTask) {
                this.stopAutoLoop('NOTICE: Pick an environment tier before enabling training loop.');
                return;
            }

            if (!this.currentEpisodeId || this.episodeDone) {
                this.autoRunAfterReset = true;
                this.startEpisode(this.currentTask);
                return;
            }

            this.runAgent(true);
        } else {
            this.stopAutoLoop('\nNOTICE: Autonomous training loop halted.');
        }
    },
    
    runAgent: function(isLooping) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.stopAutoLoop('WARNING: Gateway link unavailable. Reconnect and retry.');
            return;
        }

        if (!this.currentEpisodeId || this.episodeDone) {
            if (isLooping && this.currentTask) {
                this.autoRunAfterReset = true;
                this.startEpisode(this.currentTask);
            } else {
                this.terminalPrint('NOTICE: Episode finished. Start a tier to create a new case.');
            }
            return;
        }

        this.terminalPrint(`\nINFO: AI Judge invoked for Judicial Evaluation.`);
        
        const term = document.getElementById('terminal-output');
        this.terminalActiveLine = document.createElement('div');
        this.terminalActiveLine.className = 'log-line active';
        term.appendChild(this.terminalActiveLine);
        
        document.getElementById('btn-run-agent').disabled = true;
        document.getElementById('btn-auto-loop').disabled = !isLooping;
        
        const config = JSON.parse(sessionStorage.getItem('env_config') || '{}');
        this.ws.send(JSON.stringify({ action: "run_agent", config: config }));

        // Kinetic Active State
        document.querySelectorAll('.card').forEach(c => c.style.borderColor = 'var(--indigo-500)');
    },

    setAgentButtonsIdle: function() {
        const runBtn = document.getElementById('btn-run-agent');
        const loopBtn = document.getElementById('btn-auto-loop');
        if (runBtn) runBtn.disabled = false;
        if (loopBtn) {
            loopBtn.disabled = false;
            if (this.isAutoTraining) {
                loopBtn.innerHTML = '<i class="fa-solid fa-stop"></i> Terminate Loop';
                loopBtn.style.background = 'var(--zinc-50)';
                loopBtn.style.color = 'var(--zinc-950)';
            } else {
                loopBtn.innerHTML = '<i class="fa-solid fa-bolt"></i> Training Loop';
                loopBtn.style.background = '';
                loopBtn.style.color = '';
            }
        }
    },

    stopAutoLoop: function(message) {
        this.isAutoTraining = false;
        this.autoRunAfterReset = false;
        this.setAgentButtonsIdle();
        if (message) this.terminalPrint(message);
    },

    handleServerError: function(message) {
        const text = message || 'Unknown internal error';
        this.terminalPrint(`[ALERT] Internal Error: ${text}`);
        console.error('ContentGuard Error:', text);

        const lowered = text.toLowerCase();
        if (lowered.includes('episode finished') || lowered.includes('reset()') || lowered.includes('api key') || lowered.includes('authentication')) {
            this.stopAutoLoop('NOTICE: Loop paused due to gateway guard. Resetting case is required.');
        } else {
            this.setAgentButtonsIdle();
        }
    },
    
    handleStreamChunk: function(content) {
        if (!this.terminalActiveLine) {
            const term = document.getElementById('terminal-output');
            this.terminalActiveLine = document.createElement('div');
            this.terminalActiveLine.className = 'log-line active';
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
            this.terminalActiveLine.classList.remove('active');
            this.terminalActiveLine = null;
        }

        this.episodeDone = true;

        // Reset Kinetic States
        document.querySelectorAll('.card').forEach(c => c.style.borderColor = '');

        const scoreDisplay = document.getElementById('reward-display');
        const title = document.getElementById('diagnostic-title');
        const parsedReward = Number(result.reward);
        const rw = Number.isFinite(parsedReward) ? parsedReward : 0;
        const feedback = (result.info && result.info.feedback) ? result.info.feedback : "";
        
        // --- Credential Interceptor (Vanguard Logic) ---
        const feedbackLower = feedback.toLowerCase();
        const isAuthError = feedbackLower.includes("401") || feedbackLower.includes("invalid api key") || feedbackLower.includes("incorrect api key") || feedbackLower.includes("authentication failed");
        
        if (isAuthError) {
            this.terminalPrint("ALERT: Security Handshake Failed. Halting operations.");
            this.stopAutoLoop();
            title.textContent = "SECURITY_HANDSHAKE_FAILED";
            title.style.color = "var(--rose-500)";
            scoreDisplay.textContent = "FAULT";
            scoreDisplay.style.color = "var(--rose-500)";
        } else {
            title.textContent = "Judicial Alignment Captured";
            title.style.color = "var(--indigo-500)";
            scoreDisplay.textContent = Number.isFinite(rw) ? rw.toFixed(4) : '0.0000';
            
            // Dynamic Grading Color
            if (rw >= 0.8) scoreDisplay.style.color = 'var(--emerald-500)';
            else if (rw >= 0.4) scoreDisplay.style.color = 'var(--amber-500)';
            else scoreDisplay.style.color = 'var(--rose-500)';
        }

        document.getElementById('feedback-display').textContent = feedback;
        document.getElementById('reward-overlay').style.display = 'flex';
        this.setAgentButtonsIdle();
        
        // HUD Stats Update
        this.metrics.count++;
        this.metrics.sumReward += rw;
        document.getElementById('hud-episodes').textContent = this.metrics.count;
        document.getElementById('hud-accuracy').textContent = ((this.metrics.sumReward / this.metrics.count) * 100).toFixed(1) + '%';
        
        if (this.isAutoTraining) {
            setTimeout(() => {
                if (this.isAutoTraining) {
                    this.closeReward();
                    if (this.currentTask) {
                        this.autoRunAfterReset = true;
                        this.startEpisode(this.currentTask);
                    } else {
                        this.stopAutoLoop('NOTICE: Training loop paused because no tier is selected.');
                    }
                }
            }, 1800);
        }
    },
    
    closeReward: function() {
        document.getElementById('reward-overlay').style.display = 'none';
        if (!this.isAutoTraining) {
            this.terminalPrint(`LOG: Alignment evaluation captured and dismissed.`);
        }
    },

    clearTerminal: function() {
        document.getElementById('terminal-output').innerHTML = '';
        this.terminalPrint('SESSION: Buffer cleared. Awaiting telemetry...');
    },
    
    terminalPrint: function(msg) {
        if (this.terminalActiveLine) {
            this.terminalActiveLine.classList.remove('active');
            this.terminalActiveLine = null;
        }
        const term = document.getElementById('terminal-output');
        const line = document.createElement('div');
        line.className = 'log-line';
        line.textContent = msg;
        term.appendChild(line);
        
        while (term.children.length > 50) term.removeChild(term.firstChild);
        term.scrollTop = term.scrollHeight;
    },
    
    typeWriterEffect: function(elemId, text, speed) {
        if (this.typewriterTimeout) clearTimeout(this.typewriterTimeout);
        const el = document.getElementById(elemId);
        el.textContent = '';
        let i = 0;
        const type = () => {
            if (i < text.length) {
                el.textContent += text.charAt(i);
                i++;
                this.typewriterTimeout = setTimeout(type, speed);
            }
        };
        type();
    },

    // ===== SYSTEM VISUALS =====
    initVisuals: function() {
        const canvas = document.getElementById('fluid-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let width = canvas.width = window.innerWidth;
        let height = canvas.height = window.innerHeight;
        const particles = [];

        window.addEventListener('resize', () => {
            width = canvas.width = window.innerWidth;
            height = canvas.height = window.innerHeight;
        });

        for (let i = 0; i < 40; i++) {
            particles.push({
                x: Math.random() * width,
                y: Math.random() * height,
                vx: (Math.random() - 0.5) * 0.2,
                vy: (Math.random() - 0.5) * 0.2,
                radius: Math.random() * 2 + 1,
                color: `rgba(99, 102, 241, ${Math.random() * 0.15})`
            });
        }

        const draw = () => {
            ctx.clearRect(0, 0, width, height);
            particles.forEach(p => {
                p.x += p.vx; p.y += p.vy;
                if (p.x < 0 || p.x > width) p.vx *= -1;
                if (p.y < 0 || p.y > height) p.vy *= -1;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.fillStyle = p.color;
                ctx.fill();
            });
            requestAnimationFrame(draw);
        }
        draw();
    },

    // ===== SETTINGS MANAGEMENT =====
    toggleSettings: function() {
        const modal = document.getElementById('settings-modal');
        modal.style.display = modal.style.display === 'none' ? 'flex' : 'none';
        if (modal.style.display === 'flex') this.loadSettings();
    },

    saveSettings: function() {
        const apiKey = document.getElementById('cfg-api-key').value;
        const baseUrl = document.getElementById('cfg-base-url').value;
        const model = document.getElementById('cfg-model').value;

        // Auto-Router Suggestion
        if (apiKey.startsWith('hf_') && (!baseUrl || baseUrl.includes('openai.com'))) {
            document.getElementById('cfg-base-url').value = "https://api-inference.huggingface.co/v1";
        }

        const config = {
            api_key: apiKey,
            base_url: document.getElementById('cfg-base-url').value,
            model: document.getElementById('cfg-model').value
        };
        sessionStorage.setItem('env_config', JSON.stringify(config));
        this.terminalPrint("SYSTEM: Developer credentials synchronized and active.");
        this.toggleSettings();
    },

    clearSettings: function() {
        sessionStorage.removeItem('env_config');
        document.getElementById('cfg-api-key').value = '';
        document.getElementById('cfg-base-url').value = '';
        document.getElementById('cfg-model').value = '';
        this.terminalPrint("SYSTEM: All custom credentials purged.");
    },

    loadSettings: function() {
        const config = JSON.parse(sessionStorage.getItem('env_config') || '{}');
        if (config.api_key) document.getElementById('cfg-api-key').value = config.api_key;
        if (config.base_url) document.getElementById('cfg-base-url').value = config.base_url;
        if (config.model) document.getElementById('cfg-model').value = config.model;
    }
};

window.onload = () => app.init();
