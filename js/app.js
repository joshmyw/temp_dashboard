/**
 * Main Application Controller for Room Climate Web App (PWA)
 */

class ClimateApp {
  constructor() {
    this.latestData = null;
    this.previousData = null;
    this.historyData = [];
    this.refreshIntervalSec = parseInt(localStorage.getItem('climate_refresh_sec') || '30', 10);
    this.timer = null;
    this.countdown = this.refreshIntervalSec;
    this.deferredInstallPrompt = null;
    this.currentTab = 'overview';
  }

  init() {
    this.initTheme();
    this.initPWA();
    this.initEventListeners();
    window.chartCtrl.init('historyChart');

    // โหลดข้อมูลครั้งแรก
    this.refreshAll();
    this.startRefreshTimer();
  }

  /* ============================================================
     1. Theme & Appearance
     ============================================================ */
  initTheme() {
    const savedTheme = localStorage.getItem('climate_theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
      document.documentElement.classList.add('dark');
      this.updateThemeButton(true);
    } else {
      document.documentElement.classList.remove('dark');
      this.updateThemeButton(false);
    }
  }

  toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('climate_theme', isDark ? 'dark' : 'light');
    this.updateThemeButton(isDark);
    window.chartCtrl.setTheme(isDark);
  }

  updateThemeButton(isDark) {
    const btn = document.getElementById('themeToggleBtn');
    if (!btn) return;
    btn.innerHTML = isDark
      ? `<svg class="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 9h-1m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>`
      : `<svg class="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>`;
  }

  /* ============================================================
     2. PWA & Service Worker
     ============================================================ */
  initPWA() {
    // ลงทะเบียน Service Worker
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then(reg => console.log('[PWA] Service Worker registered:', reg.scope))
          .catch(err => console.warn('[PWA] Service Worker registration failed:', err));
      });
    }

    // ตรวจสอบการรองรับการติดตั้งลงเครื่อง (Add to Home Screen)
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredInstallPrompt = e;
      const installBtn = document.getElementById('installAppBtn');
      if (installBtn) {
        installBtn.classList.remove('hidden');
      }
    });

    window.addEventListener('appinstalled', () => {
      console.log('[PWA] แอปได้รับการติดตั้งสำเร็จ');
      this.deferredInstallPrompt = null;
      const installBtn = document.getElementById('installAppBtn');
      if (installBtn) installBtn.classList.add('hidden');
    });

    // ตรวจจับสถานะ Online / Offline
    window.addEventListener('online', () => this.updateConnectionBadge('online'));
    window.addEventListener('offline', () => this.updateConnectionBadge('offline'));
  }

  promptInstall() {
    if (!this.deferredInstallPrompt) {
      alert('หากใช้ iPhone/iPad ให้กดปุ่ม Share (แชร์) แล้วเลือก "เพิ่มไปยังหน้าจอโฮม (Add to Home Screen)"');
      return;
    }
    this.deferredInstallPrompt.prompt();
    this.deferredInstallPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        console.log('[PWA] ผู้ใช้ยอมรับการติดตั้ง');
      }
      this.deferredInstallPrompt = null;
      const installBtn = document.getElementById('installAppBtn');
      if (installBtn) installBtn.classList.add('hidden');
    });
  }

  /* ============================================================
     3. Tab Navigation
     ============================================================ */
  switchTab(tabId) {
    this.currentTab = tabId;

    // ซ่อนทุกแท็บ
    ['overview', 'analytics', 'history'].forEach(id => {
      const panel = document.getElementById(`tab-${id}`);
      if (panel) panel.classList.add('hidden');
    });

    // แสดงแท็บที่เลือก
    const activePanel = document.getElementById(`tab-${tabId}`);
    if (activePanel) activePanel.classList.remove('hidden');

    // ปรับสไตล์ปุ่มแท็บ Desktop
    document.querySelectorAll('.tab-btn').forEach(btn => {
      if (btn.dataset.tab === tabId) {
        btn.classList.add('active', 'border-indigo-600', 'text-indigo-600');
        btn.classList.remove('text-slate-500', 'border-transparent');
      } else {
        btn.classList.remove('active', 'border-indigo-600', 'text-indigo-600');
        btn.classList.add('text-slate-500', 'border-transparent');
      }
    });

    // ปรับสไตล์ปุ่ม Bottom Navigation Mobile
    document.querySelectorAll('.bottom-nav-btn').forEach(btn => {
      if (btn.dataset.tab === tabId) {
        btn.classList.add('active', 'text-indigo-600', 'dark:text-indigo-400');
        btn.classList.remove('text-slate-400');
      } else {
        btn.classList.remove('active', 'text-indigo-600', 'dark:text-indigo-400');
        btn.classList.add('text-slate-400');
      }
    });

    // หากเปิดแท็บกราฟ ให้เรียก Chart resize
    if (tabId === 'analytics' && window.chartCtrl.chart) {
      window.chartCtrl.chart.resize();
    }
  }

  /* ============================================================
     4. Data Fetching & Calculations
     ============================================================ */
  async refreshAll() {
    this.updateConnectionBadge('loading');

    try {
      // 1. ดึงข้อมูลล่าสุด
      const latestResp = await window.apiService.fetchLatest();
      if (latestResp && latestResp.status === 'success') {
        if (this.latestData) {
          this.previousData = { ...this.latestData };
        }
        this.latestData = latestResp;
        this.renderLatestData(latestResp);
        this.updateConnectionBadge('online');
      } else {
        this.updateConnectionBadge('empty');
      }

      // 2. ดึงประวัติข้อมูล
      const historyResp = await window.apiService.fetchHistory();
      if (historyResp && historyResp.status === 'success' && Array.isArray(historyResp.data)) {
        this.historyData = historyResp.data;
        window.chartCtrl.updateData(this.historyData);
        this.renderHistoryTable(this.historyData);
        this.renderStatistics(this.historyData);
      }

      this.countdown = this.refreshIntervalSec;
      this.updateCountdownDisplay();

    } catch (err) {
      console.error('Refresh error:', err);
      this.updateConnectionBadge('error', err.message);
    }
  }

  startRefreshTimer() {
    if (this.timer) clearInterval(this.timer);
    if (this.refreshIntervalSec <= 0) return; // ปิดออโต้รีเฟรช

    this.countdown = this.refreshIntervalSec;
    this.timer = setInterval(() => {
      this.countdown--;
      this.updateCountdownDisplay();
      if (this.countdown <= 0) {
        this.countdown = this.refreshIntervalSec;
        this.refreshAll();
      }
    }, 1000);
  }

  updateCountdownDisplay() {
    const el = document.getElementById('refreshCountdown');
    if (el) {
      if (this.refreshIntervalSec > 0) {
        el.innerText = `อัปเดตใน ${this.countdown}s`;
      } else {
        el.innerText = 'ปิดรีเฟรชออโต้';
      }
    }
  }

  updateConnectionBadge(status, message = '') {
    const badge = document.getElementById('connectionBadge');
    if (!badge) return;

    if (status === 'online') {
      badge.className = 'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300';
      badge.innerHTML = '<span class="w-2 h-2 mr-1.5 rounded-full bg-emerald-500 animate-pulse"></span>ออนไลน์';
    } else if (status === 'loading') {
      badge.className = 'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300';
      badge.innerHTML = '<span class="w-2 h-2 mr-1.5 rounded-full bg-indigo-500 animate-spin"></span>กำลังดึงข้อมูล...';
    } else if (status === 'offline') {
      badge.className = 'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-400';
      badge.innerHTML = '<span class="w-2 h-2 mr-1.5 rounded-full bg-slate-500"></span>ออฟไลน์';
    } else if (status === 'empty') {
      badge.className = 'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
      badge.innerHTML = '<span class="w-2 h-2 mr-1.5 rounded-full bg-amber-500"></span>ยังไม่มีข้อมูล';
    } else {
      badge.className = 'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300';
      badge.innerHTML = `<span class="w-2 h-2 mr-1.5 rounded-full bg-rose-500"></span>ขัดข้อง`;
    }
  }

  /* ============================================================
     5. Render Dashboard Cards & Physics Indexes
     ============================================================ */
  renderLatestData(data) {
    const temp = Number(data.temperature);
    const humid = Number(data.humidity);

    // ค่าอุณหภูมิและความชื้นหลัก
    document.getElementById('tempValue').innerText = temp.toFixed(1);
    document.getElementById('humidValue').innerText = humid.toFixed(1);
    document.getElementById('lastUpdatedText').innerText = `ข้อมูลล่าสุดเมื่อ: ${data.timestamp}`;

    // Delta จากรอบก่อน
    if (this.previousData) {
      const tempDiff = temp - this.previousData.temperature;
      const humidDiff = humid - this.previousData.humidity;
      this.renderDelta('tempDelta', tempDiff, '°C');
      this.renderDelta('humidDelta', humidDiff, '%');
    }

    // คำนวณ Heat Index (รู้สึกจริง) และ Dew Point (จุดน้ำค้าง)
    const heatIndex = this.calculateHeatIndex(temp, humid);
    const dewPoint = this.calculateDewPoint(temp, humid);

    const hiEl = document.getElementById('heatIndexValue');
    if (hiEl) hiEl.innerText = heatIndex.toFixed(1);

    const dpEl = document.getElementById('dewPointValue');
    if (dpEl) dpEl.innerText = dewPoint.toFixed(1);

    // คำนวณระดับความสบาย (Comfort Level)
    this.renderComfortLevel(temp, humid, heatIndex);
  }

  renderDelta(elementId, diff, unit) {
    const el = document.getElementById(elementId);
    if (!el) return;
    if (Math.abs(diff) < 0.05) {
      el.innerHTML = `<span class="text-slate-400">คงที่</span>`;
    } else if (diff > 0) {
      el.innerHTML = `<span class="text-rose-500 font-medium">▲ +${diff.toFixed(1)}${unit}</span>`;
    } else {
      el.innerHTML = `<span class="text-sky-500 font-medium">▼ ${diff.toFixed(1)}${unit}</span>`;
    }
  }

  // คำนวณ Heat Index (อุณหภูมิที่รู้สึกจริง)
  calculateHeatIndex(T, RH) {
    if (T < 27) return T; // สูตร Heat Index เหมาะกับ T >= 27°C
    const T_F = (T * 9 / 5) + 32;
    let HI_F = -42.379 + 2.04901523 * T_F + 10.14333127 * RH
      - 0.22475541 * T_F * RH - 0.00683783 * T_F * T_F
      - 0.05481717 * RH * RH + 0.00122874 * T_F * T_F * RH
      + 0.00085282 * T_F * RH * RH - 0.00000199 * T_F * T_F * RH * RH;
    return (HI_F - 32) * 5 / 9;
  }

  // คำนวณ Dew Point (จุดน้ำค้างตามสูตร Magnus)
  calculateDewPoint(T, RH) {
    const a = 17.27;
    const b = 237.7;
    const alpha = ((a * T) / (b + T)) + Math.log(RH / 100);
    return (b * alpha) / (a - alpha);
  }

  renderComfortLevel(temp, humid, heatIndex) {
    const tempStatusEl = document.getElementById('tempStatus');
    const humidStatusEl = document.getElementById('humidStatus');
    const comfortBadgeEl = document.getElementById('comfortBadge');

    // สถานะอุณหภูมิ
    if (tempStatusEl) {
      if (temp >= 35) tempStatusEl.innerHTML = '<span class="text-rose-600 font-semibold">ร้อนจัด 🔥</span>';
      else if (temp >= 30) tempStatusEl.innerHTML = '<span class="text-amber-600">ค่อนข้างร้อน ☀️</span>';
      else if (temp >= 24) tempStatusEl.innerHTML = '<span class="text-emerald-600">กำลังพอดี สบาย 🌿</span>';
      else tempStatusEl.innerHTML = '<span class="text-sky-600">เย็นสบาย ❄️</span>';
    }

    // สถานะความชื้น
    if (humidStatusEl) {
      if (humid >= 75) humidStatusEl.innerHTML = '<span class="text-indigo-600">ชื้นสูงมาก (เหนียวตัว) 💧</span>';
      else if (humid >= 60) humidStatusEl.innerHTML = '<span class="text-sky-600">ชื้นปานกลาง 🌦️</span>';
      else if (humid >= 40) humidStatusEl.innerHTML = '<span class="text-emerald-600">เหมาะสมดีเยี่ยม ✨</span>';
      else humidStatusEl.innerHTML = '<span class="text-amber-600">อากาศแห้ง 🌵</span>';
    }

    // สรุปสภาวะห้องโดยรวม (Overall Comfort)
    if (comfortBadgeEl) {
      if (heatIndex > 38) {
        comfortBadgeEl.className = 'px-3 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300';
        comfortBadgeEl.innerText = '🥵 ร้อนอบอ้าว ควรเปิดพัดลม/แอร์';
      } else if (temp >= 24 && temp <= 29 && humid >= 40 && humid <= 65) {
        comfortBadgeEl.className = 'px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300';
        comfortBadgeEl.innerText = '😊 สภาพอากาศเหมาะสม สบายตัว';
      } else if (humid < 40) {
        comfortBadgeEl.className = 'px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300';
        comfortBadgeEl.innerText = '🌵 อากาศแห้ง ควรดื่มน้ำหรือเปิดเครื่องเพิ่มความชื้น';
      } else {
        comfortBadgeEl.className = 'px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300';
        comfortBadgeEl.innerText = '🌤️ อากาศทั่วไป';
      }
    }
  }

  /* ============================================================
     6. Summary Statistics
     ============================================================ */
  renderStatistics(history) {
    if (!history || history.length === 0) return;

    const temps = history.map(h => Number(h.temperature)).filter(n => !isNaN(n));
    const humids = history.map(h => Number(h.humidity)).filter(n => !isNaN(n));

    if (temps.length === 0) return;

    const maxTemp = Math.max(...temps);
    const minTemp = Math.min(...temps);
    const avgTemp = temps.reduce((a, b) => a + b, 0) / temps.length;

    const maxHumid = Math.max(...humids);
    const minHumid = Math.min(...humids);
    const avgHumid = humids.reduce((a, b) => a + b, 0) / humids.length;

    const setVal = (id, val, unit) => {
      const el = document.getElementById(id);
      if (el) el.innerText = `${val.toFixed(1)}${unit}`;
    };

    setVal('statMaxTemp', maxTemp, '°C');
    setVal('statMinTemp', minTemp, '°C');
    setVal('statAvgTemp', avgTemp, '°C');

    setVal('statMaxHumid', maxHumid, '%');
    setVal('statMinHumid', minHumid, '%');
    setVal('statAvgHumid', avgHumid, '%');
  }

  /* ============================================================
     7. History Table & Search
     ============================================================ */
  formatTimestampForDisplay(r) {
    if (r.date && r.time) {
      return `${r.date} ${r.time}`;
    }
    if (r.timestamp && r.timestamp.includes(' ')) {
      return r.timestamp;
    }
    const datePrefix = this.latestData?.timestamp?.split(/[ T]/)[0] || new Date().toISOString().slice(0, 10);
    return `${datePrefix} ${r.timestamp}`;
  }

  renderHistoryTable(data, searchQuery = '') {
    const tbody = document.getElementById('historyTableBody');
    if (!tbody) return;

    let rows = [...data].reverse(); // เอาล่าสุดขึ้นก่อน
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase().trim();
      rows = rows.filter(r => this.formatTimestampForDisplay(r).toLowerCase().includes(q));
    }

    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="px-4 py-8 text-center text-slate-400">ไม่พบข้อมูลที่ตรงกับคำค้นหา</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map((r, idx) => `
      <tr class="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
        <td class="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">${idx + 1}</td>
        <td class="px-4 py-3 font-medium text-slate-800 dark:text-slate-200 text-sm whitespace-nowrap">
          📅 ${this.formatTimestampForDisplay(r)}
        </td>
        <td class="px-4 py-3 text-rose-600 dark:text-rose-400 font-semibold text-sm">
          ${Number(r.temperature).toFixed(1)} °C
        </td>
        <td class="px-4 py-3 text-sky-600 dark:text-sky-400 font-semibold text-sm">
          ${Number(r.humidity).toFixed(1)} %
        </td>
      </tr>
    `).join('');
  }

  /* ============================================================
     8. Data Export (CSV & JSON)
     ============================================================ */
  exportCSV() {
    if (!this.historyData || this.historyData.length === 0) {
      alert('ยังไม่มีข้อมูลสำหรับส่งออก');
      return;
    }

    // ใส่ UTF-8 BOM (\uFEFF) เพื่อให้โปรแกรม Microsoft Excel เปิดภาษาไทยได้อย่างถูกต้อง
    let csvContent = '\uFEFFDate & Time,Temperature (C),Humidity (%)\r\n';
    this.historyData.forEach(row => {
      csvContent += `"${this.formatTimestampForDisplay(row)}",${row.temperature},${row.humidity}\r\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `climate-data-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  exportJSON() {
    if (!this.historyData || this.historyData.length === 0) {
      alert('ยังไม่มีข้อมูลสำหรับส่งออก');
      return;
    }

    const jsonString = JSON.stringify(this.historyData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `climate-data-${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /* ============================================================
     9. Settings Modal
     ============================================================ */
  openSettingsModal() {
    const modal = document.getElementById('settingsModal');
    const urlInput = document.getElementById('settingsApiUrl');
    const refreshSelect = document.getElementById('settingsRefreshSec');

    if (urlInput) urlInput.value = window.apiService.getApiUrl();
    if (refreshSelect) refreshSelect.value = String(this.refreshIntervalSec);
    if (modal) modal.classList.remove('hidden');
  }

  closeSettingsModal() {
    const modal = document.getElementById('settingsModal');
    if (modal) modal.classList.add('hidden');
  }

  async testSettingsConnection() {
    const urlInput = document.getElementById('settingsApiUrl');
    const testResultEl = document.getElementById('testConnectionResult');
    if (!urlInput || !testResultEl) return;

    testResultEl.className = 'text-xs mt-2 text-indigo-500';
    testResultEl.innerText = 'กำลังทดสอบเชื่อมต่อ...';

    const res = await window.apiService.testConnection(urlInput.value);
    if (res.success) {
      testResultEl.className = 'text-xs mt-2 text-emerald-600 font-medium';
      testResultEl.innerText = `✅ เชื่อมต่อสำเร็จ! (ค่าล่าสุด: ${res.data.temperature}°C, ${res.data.humidity}%)`;
    } else {
      testResultEl.className = 'text-xs mt-2 text-rose-600 font-medium';
      testResultEl.innerText = `❌ ไม่สามารถเชื่อมต่อได้: ${res.message}`;
    }
  }

  saveSettings() {
    const urlInput = document.getElementById('settingsApiUrl');
    const refreshSelect = document.getElementById('settingsRefreshSec');

    if (urlInput) {
      window.apiService.setApiUrl(urlInput.value);
    }

    if (refreshSelect) {
      this.refreshIntervalSec = parseInt(refreshSelect.value, 10);
      localStorage.setItem('climate_refresh_sec', String(this.refreshIntervalSec));
      this.startRefreshTimer();
    }

    this.closeSettingsModal();
    this.refreshAll();
  }

  /* ============================================================
     10. Event Listeners
     ============================================================ */
  initEventListeners() {
    // Desktop Tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
    });

    // Mobile Bottom Navigation buttons
    document.querySelectorAll('.bottom-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
    });

    // Refresh button
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', () => this.refreshAll());

    // Theme toggle button
    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) themeBtn.addEventListener('click', () => this.toggleTheme());

    // Install App button
    const installBtn = document.getElementById('installAppBtn');
    if (installBtn) installBtn.addEventListener('click', () => this.promptInstall());

    // Settings open/close buttons
    const openSettingsBtn = document.getElementById('openSettingsBtn');
    if (openSettingsBtn) openSettingsBtn.addEventListener('click', () => this.openSettingsModal());

    const closeSettingsBtn = document.getElementById('closeSettingsBtn');
    if (closeSettingsBtn) closeSettingsBtn.addEventListener('click', () => this.closeSettingsModal());

    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', () => this.saveSettings());

    const testConnBtn = document.getElementById('testConnectionBtn');
    if (testConnBtn) testConnBtn.addEventListener('click', () => this.testSettingsConnection());

    const resetUrlBtn = document.getElementById('resetUrlBtn');
    if (resetUrlBtn) {
      resetUrlBtn.addEventListener('click', () => {
        const defaultUrl = window.apiService.resetApiUrl();
        const urlInput = document.getElementById('settingsApiUrl');
        if (urlInput) urlInput.value = defaultUrl;
      });
    }

    // Chart Filter buttons
    document.querySelectorAll('.chart-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.chart-filter-btn').forEach(b => {
          b.classList.remove('bg-indigo-600', 'text-white');
          b.classList.add('bg-slate-100', 'text-slate-600', 'dark:bg-slate-800', 'dark:text-slate-300');
        });
        btn.classList.add('bg-indigo-600', 'text-white');
        btn.classList.remove('bg-slate-100', 'text-slate-600', 'dark:bg-slate-800', 'dark:text-slate-300');
        window.chartCtrl.setFilter(btn.dataset.filter);
      });
    });

    // Chart Limit dropdown
    const limitSelect = document.getElementById('chartLimitSelect');
    if (limitSelect) {
      limitSelect.addEventListener('change', (e) => {
        window.chartCtrl.updateData(this.historyData, parseInt(e.target.value, 10));
      });
    }

    // History Table Search input
    const searchInput = document.getElementById('historySearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.renderHistoryTable(this.historyData, e.target.value);
      });
    }

    // Export buttons
    const exportCsvBtn = document.getElementById('exportCsvBtn');
    if (exportCsvBtn) exportCsvBtn.addEventListener('click', () => this.exportCSV());

    const exportJsonBtn = document.getElementById('exportJsonBtn');
    if (exportJsonBtn) exportJsonBtn.addEventListener('click', () => this.exportJSON());
  }
}

// Start app on DOM load
window.addEventListener('DOMContentLoaded', () => {
  window.climateApp = new ClimateApp();
  window.climateApp.init();
});
