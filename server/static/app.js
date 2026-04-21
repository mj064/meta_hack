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
    oversightStickToBottom: true,
    metrics: { count: 0, sumReward: 0 },
    scrollPending: false,
    activeTab: 'arena',
    hasStartedEpisode: false,
    historyEntries: [],
    historyLimit: 80,
    historyStorageKey: 'contentguard_history_v1',
    activeEpisodeRecord: null,
    streamLineBuffer: '',

    init: function() {
        // Orchestrate the "Breathe-in" Sequence
        this.connectWS();
        this.initVisuals();
        this.loadSettings();
        this.bindHotkeys();
        this.bindOversightViewport();
        this.loadHistory();
        this.switchTab('arena');
        this.renderHistory();

        window.addEventListener('resize', () => {
            this.scrollOversightToBottom(true);
            if (this.activeTab === 'history') {
                this.drawAccuracyChart();
            }
        });
        
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

    bindHotkeys: function() {
        document.addEventListener('keydown', (event) => {
            if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;

            const target = event.target;
            const tag = target && target.tagName ? target.tagName.toLowerCase() : '';
            if (target && (target.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select')) return;

            const modal = document.getElementById('settings-modal');
            if (modal && modal.style.display === 'flex') return;

            event.preventDefault();
            this.quickCycleEpisode();
        });
    },

    bindOversightViewport: function() {
        const term = document.getElementById('terminal-output');
        if (!term) return;

        this.oversightStickToBottom = true;
        term.addEventListener('scroll', () => {
            const distanceFromBottom = term.scrollHeight - term.scrollTop - term.clientHeight;
            this.oversightStickToBottom = distanceFromBottom < 36;
        });
    },

    scrollOversightToBottom: function(force) {
        const term = document.getElementById('terminal-output');
        if (!term) return;
        if (force || this.oversightStickToBottom) {
            term.scrollTop = term.scrollHeight;
        }
    },

    quickCycleEpisode: function() {
        if (!this.currentTask) {
            this.terminalPrint('NOTICE: Select an environment tier before quick-cycle (/).');
            return;
        }
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.terminalPrint('WARNING: Gateway link unavailable. Wait for LINK ACTIVE.');
            return;
        }

        const overlay = document.getElementById('reward-overlay');
        if (overlay) overlay.style.display = 'none';

        this.terminalPrint('LOG: Quick-cycle trigger received (/). Starting next episode...');
        if (this.isAutoTraining) {
            this.autoRunAfterReset = true;
        }
        this.startEpisode(this.currentTask, { preserveAutoRun: this.isAutoTraining });
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
    switchTab: function(tabName) {
        const nextTab = tabName === 'history' ? 'history' : 'arena';
        this.activeTab = nextTab;

        document.querySelectorAll('.workspace-tab').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === nextTab);
        });

        const landing = document.getElementById('landing-page');
        const main = document.getElementById('main-interface');
        const history = document.getElementById('history-page');

        if (nextTab === 'history') {
            if (landing) landing.style.display = 'none';
            if (main) main.style.display = 'none';
            if (history) history.style.display = 'block';
            this.renderHistory();
            requestAnimationFrame(() => this.drawAccuracyChart());
            return;
        }

        if (history) history.style.display = 'none';
        if (this.hasStartedEpisode) {
            if (landing) landing.style.display = 'none';
            if (main) main.style.display = 'grid';
        } else {
            if (landing) landing.style.display = 'block';
            if (main) main.style.display = 'none';
        }
        this.scrollOversightToBottom(true);
    },

    loadHistory: function() {
        try {
            const raw = sessionStorage.getItem(this.historyStorageKey);
            if (!raw) {
                this.updateMetricsFromHistory();
                return;
            }

            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                this.historyEntries = parsed
                    .filter(entry => entry && typeof entry === 'object')
                    .slice(0, this.historyLimit)
                    .map(entry => ({
                        timestamp: entry.timestamp || '',
                        episodeId: entry.episodeId || 'n/a',
                        postId: entry.postId || 'unknown',
                        taskId: entry.taskId || '',
                        taskLabel: entry.taskLabel || 'Unknown Tier',
                        prediction: entry.prediction || 'Not captured',
                        score: Number(entry.score) || 0,
                        feedback: entry.feedback || '',
                        logs: entry.logs || ''
                    }));
            }
        } catch (_) {
            this.historyEntries = [];
        }

        this.updateMetricsFromHistory();
    },

    saveHistory: function() {
        try {
            sessionStorage.setItem(this.historyStorageKey, JSON.stringify(this.historyEntries));
        } catch (_) {
            // If storage is unavailable, continue with in-memory history only.
        }
    },

    updateMetricsFromHistory: function() {
        const count = this.historyEntries.length;
        const sumReward = this.historyEntries.reduce((acc, entry) => acc + (Number(entry.score) || 0), 0);
        this.metrics.count = count;
        this.metrics.sumReward = sumReward;

        const hudEpisodes = document.getElementById('hud-episodes');
        const hudAccuracy = document.getElementById('hud-accuracy');
        if (hudEpisodes) hudEpisodes.textContent = String(count);
        if (hudAccuracy) {
            const avg = count > 0 ? (sumReward / count) * 100 : 0;
            hudAccuracy.textContent = `${avg.toFixed(1)}%`;
        }

        const historySummary = document.getElementById('history-summary');
        if (historySummary) {
            if (count === 0) {
                historySummary.textContent = 'No Episodes';
            } else {
                const avg = (sumReward / count) * 100;
                historySummary.textContent = `${count} Episodes · Avg ${avg.toFixed(1)}%`;
            }
        }
    },

    startEpisodeRecord: function(taskId) {
        this.activeEpisodeRecord = {
            episodeId: null,
            postId: null,
            taskId: taskId || this.currentTask || '',
            prediction: '',
            logs: ''
        };
        this.streamLineBuffer = '';
    },

    appendEpisodeLog: function(content) {
        if (!this.activeEpisodeRecord || !content) return;

        const existing = this.activeEpisodeRecord.logs || '';
        const merged = `${existing}${content}`;
        const maxLen = 18000;
        this.activeEpisodeRecord.logs = merged.length > maxLen ? merged.slice(merged.length - maxLen) : merged;
    },

    capturePredictionFromStream: function(content) {
        if (!content) return;

        this.streamLineBuffer += content;
        let newlineIdx = this.streamLineBuffer.indexOf('\n');
        while (newlineIdx !== -1) {
            const line = this.streamLineBuffer.slice(0, newlineIdx);
            this.inspectStreamLine(line);
            this.streamLineBuffer = this.streamLineBuffer.slice(newlineIdx + 1);
            newlineIdx = this.streamLineBuffer.indexOf('\n');
        }
    },

    inspectStreamLine: function(rawLine) {
        const line = (rawLine || '').trim();
        if (!line) return;

        const marker = '[STEP] Policy Ingested:';
        const idx = line.indexOf(marker);
        if (idx !== -1) {
            const prediction = line.slice(idx + marker.length).trim();
            if (prediction) this.setEpisodePrediction(prediction);
        }
    },

    setEpisodePrediction: function(predictionValue) {
        if (!this.activeEpisodeRecord) return;
        this.activeEpisodeRecord.prediction = this.stringifyPrediction(predictionValue);
    },

    stringifyPrediction: function(predictionValue) {
        if (predictionValue === null || predictionValue === undefined) return 'Not captured';
        if (typeof predictionValue === 'string') {
            const trimmed = predictionValue.trim();
            return trimmed || 'Not captured';
        }
        try {
            return JSON.stringify(predictionValue, null, 2);
        } catch (_) {
            return String(predictionValue);
        }
    },

    escapeHTML: function(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    recordHistoryEntry: function(result, reward, feedback) {
        if (this.streamLineBuffer.trim()) {
            this.inspectStreamLine(this.streamLineBuffer);
            this.streamLineBuffer = '';
        }

        const episode = this.activeEpisodeRecord || {};
        const taskLabels = {
            easy: 'Tier I: Detection',
            medium: 'Tier II: Action',
            hard: 'Tier III: Adjudication'
        };

        let prediction = episode.prediction;
        if (!prediction && result && result.info && result.info.ground_truth && result.info.ground_truth.action) {
            prediction = `Not captured. Ground truth action: ${result.info.ground_truth.action}`;
        }
        if (!prediction) prediction = 'Not captured';

        const normalizedReward = Number.isFinite(Number(reward)) ? Number(reward) : 0;
        const taskId = episode.taskId || this.currentTask || '';
        const entry = {
            timestamp: new Date().toLocaleString(),
            episodeId: episode.episodeId || this.currentEpisodeId || 'n/a',
            postId: episode.postId || 'unknown',
            taskId: taskId,
            taskLabel: taskLabels[taskId] || taskId || 'Unknown Tier',
            prediction: prediction,
            score: normalizedReward,
            feedback: feedback || '',
            logs: (episode.logs || '').trim() || 'No logs captured for this episode.'
        };

        this.historyEntries.unshift(entry);
        if (this.historyEntries.length > this.historyLimit) {
            this.historyEntries = this.historyEntries.slice(0, this.historyLimit);
        }

        this.saveHistory();
        this.updateMetricsFromHistory();
        this.renderHistory();
    },

    renderHistory: function() {
        const list = document.getElementById('history-list');
        if (!list) return;

        if (!this.historyEntries.length) {
            list.innerHTML = '<div class="history-empty">No episodes recorded yet. Run an episode in Arena mode and results will appear here.</div>';
            if (this.activeTab === 'history') this.drawAccuracyChart();
            return;
        }

        list.innerHTML = this.historyEntries.map((entry, index) => {
            const score = Number(entry.score) || 0;
            const scoreColor = score >= 0.8 ? 'var(--emerald-500)' : (score >= 0.4 ? 'var(--amber-500)' : 'var(--rose-500)');
            const predictionSafe = this.escapeHTML(entry.prediction || 'Not captured');
            const feedbackSafe = this.escapeHTML(entry.feedback || 'No feedback available.');
            const rawLogs = entry.logs || '';
            const clippedLogs = rawLogs.length > 1800 ? `${rawLogs.slice(0, 1800)}\n...` : rawLogs;
            const logsSafe = this.escapeHTML(clippedLogs);

            return `
                <article class="history-item">
                    <header class="history-item-header">
                        <h4 class="history-item-title">#${this.historyEntries.length - index} · ${this.escapeHTML(entry.taskLabel)}</h4>
                        <span class="history-score" style="color:${scoreColor};">${score.toFixed(4)}</span>
                    </header>
                    <p class="history-meta">${this.escapeHTML(entry.timestamp)} · Episode ${this.escapeHTML(entry.episodeId)} · Post ${this.escapeHTML(entry.postId)}</p>
                    <div class="history-block">
                        <span class="history-label">Prediction</span>
                        <div class="history-block-body">${predictionSafe}</div>
                    </div>
                    <div class="history-block">
                        <span class="history-label">Feedback</span>
                        <div class="history-block-body">${feedbackSafe}</div>
                    </div>
                    <div class="history-block">
                        <span class="history-label">Logs</span>
                        <div class="history-block-body history-block-body-logs">${logsSafe}</div>
                    </div>
                </article>
            `;
        }).join('');

        if (this.activeTab === 'history') this.drawAccuracyChart();
    },

    drawAccuracyChart: function() {
        const canvas = document.getElementById('accuracy-chart');
        if (!canvas) return;

        const cssWidth = Math.floor(canvas.clientWidth || 900);
        const cssHeight = Math.floor(canvas.clientHeight || 240);
        if (cssWidth <= 0 || cssHeight <= 0) return;

        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.max(1, Math.floor(cssWidth * dpr));
        canvas.height = Math.max(1, Math.floor(cssHeight * dpr));

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cssWidth, cssHeight);

        const chartPad = { top: 16, right: 20, bottom: 30, left: 44 };
        const chartWidth = cssWidth - chartPad.left - chartPad.right;
        const chartHeight = cssHeight - chartPad.top - chartPad.bottom;

        ctx.strokeStyle = 'rgba(15, 159, 155, 0.18)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = chartPad.top + (chartHeight / 4) * i;
            ctx.beginPath();
            ctx.moveTo(chartPad.left, y);
            ctx.lineTo(chartPad.left + chartWidth, y);
            ctx.stroke();
        }

        ctx.fillStyle = 'rgba(71, 85, 105, 0.75)';
        ctx.font = '11px "IBM Plex Mono", monospace';
        [100, 75, 50, 25, 0].forEach((label, idx) => {
            const y = chartPad.top + (chartHeight / 4) * idx;
            ctx.fillText(String(label), 10, y + 4);
        });

        const values = this.historyEntries.slice().reverse().map(entry => {
            const n = Number(entry.score);
            const pct = Number.isFinite(n) ? n * 100 : 0;
            return Math.max(0, Math.min(100, pct));
        });

        if (!values.length) {
            ctx.fillStyle = 'rgba(100, 116, 139, 0.7)';
            ctx.font = '12px "Sora", sans-serif';
            ctx.fillText('No data yet. Complete an episode to visualize policy accuracy.', chartPad.left + 8, chartPad.top + chartHeight / 2);
            return;
        }

        const xForIndex = (index) => {
            if (values.length === 1) return chartPad.left + chartWidth / 2;
            return chartPad.left + (chartWidth * index) / (values.length - 1);
        };
        const yForValue = (value) => chartPad.top + chartHeight - (value / 100) * chartHeight;

        ctx.strokeStyle = 'rgba(15, 159, 155, 0.95)';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        values.forEach((val, idx) => {
            const x = xForIndex(idx);
            const y = yForValue(val);
            if (idx === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();

        ctx.fillStyle = 'rgba(15, 159, 155, 0.16)';
        ctx.beginPath();
        values.forEach((val, idx) => {
            const x = xForIndex(idx);
            const y = yForValue(val);
            if (idx === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.lineTo(xForIndex(values.length - 1), chartPad.top + chartHeight);
        ctx.lineTo(xForIndex(0), chartPad.top + chartHeight);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = 'rgba(7, 126, 122, 0.95)';
        values.forEach((val, idx) => {
            const x = xForIndex(idx);
            const y = yForValue(val);
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fill();
        });

        ctx.fillStyle = 'rgba(71, 85, 105, 0.75)';
        ctx.font = '11px "IBM Plex Mono", monospace';
        ctx.fillText(`Ep 1`, chartPad.left, cssHeight - 8);
        ctx.fillText(`Ep ${values.length}`, chartPad.left + chartWidth - 42, cssHeight - 8);
    },

    clearHistory: function() {
        this.historyEntries = [];
        this.saveHistory();
        this.updateMetricsFromHistory();
        this.renderHistory();
        this.terminalPrint('SYSTEM: Episode history has been cleared.');
    },

    startEpisode: function(taskId, options) {
        const opts = options || {};
        const preserveAutoRun = opts.preserveAutoRun === true;

        this.currentTask = taskId;
        this.hasStartedEpisode = true;
        this.startEpisodeRecord(taskId);
        if (!preserveAutoRun) {
            this.autoRunAfterReset = false;
        }
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
        if (this.activeTab === 'arena') {
            document.getElementById('main-interface').style.display = 'grid'; // Grid for Hub layout
        }
        document.getElementById('reward-overlay').style.display = 'none';
        
        this.terminalPrint(`\nLOG: Resetting Environment. Module: ${taskId.toUpperCase()}`);
    },

    handleReset: function(obs) {
        this.currentEpisodeId = obs.episode_id;
        this.episodeDone = false;
        const c = obs.content_case;
        const b = obs.policy_briefing;

        if (this.activeEpisodeRecord) {
            this.activeEpisodeRecord.episodeId = obs.episode_id;
            this.activeEpisodeRecord.postId = c.post_id;
            this.activeEpisodeRecord.taskId = obs.task_id || this.currentTask || this.activeEpisodeRecord.taskId;
        }

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
        this.setEpisodePrediction(payload);
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
                this.startEpisode(this.currentTask, { preserveAutoRun: true });
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
                this.startEpisode(this.currentTask, { preserveAutoRun: true });
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
        this.scrollOversightToBottom(true);
        
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
        this.appendEpisodeLog(content);
        this.capturePredictionFromStream(content);

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
                this.scrollOversightToBottom(true);
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

        this.recordHistoryEntry(result, rw, feedback);
        
        if (this.isAutoTraining) {
            setTimeout(() => {
                if (this.isAutoTraining) {
                    this.closeReward();
                    if (this.currentTask) {
                        this.autoRunAfterReset = true;
                        this.startEpisode(this.currentTask, { preserveAutoRun: true });
                    } else {
                        this.stopAutoLoop('NOTICE: Training loop paused because no tier is selected.');
                    }
                }
            }, 1800);
        }
    },
    
    closeReward: function(silent, autoStartNext) {
        document.getElementById('reward-overlay').style.display = 'none';

        const shouldAutoStart = !!this.currentTask && (autoStartNext === true || (!this.isAutoTraining && this.episodeDone));
        if (shouldAutoStart) {
            this.terminalPrint('LOG: Dismiss received. Starting next episode...');
            this.startEpisode(this.currentTask, { preserveAutoRun: this.isAutoTraining || this.autoRunAfterReset });
            return;
        }

        if (!silent && !this.isAutoTraining) {
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
        this.appendEpisodeLog(`${msg}\n`);
        const term = document.getElementById('terminal-output');
        const line = document.createElement('div');
        line.className = 'log-line';
        line.textContent = msg;
        term.appendChild(line);
        
        while (term.children.length > 50) term.removeChild(term.firstChild);
        this.scrollOversightToBottom(true);
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
