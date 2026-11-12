/**
 * Main Application Controller for Room Climate Web App (PWA)
 */

class ClimateApp {
  constructor() {
    this.latestData = null;
    this.previousData = null;
    this.historyData = [];
    this.currentTab = 'overview';
    this.isFetchingLatest = false;
    this.latestTimer = null;
    this.historyTimer = null;

    // เก็บค่าตัวเลขปัจจุบันเพื่อใช้ animate ขึ้น/ลง ทีละ 0.1 อย่างนุ่มนวล
    this.currentNumbers = {
      temp: null,
      humid: null,
      heatIndex: null,
      dewPoint: null
    };

    this.animFrames = {};
  }

  init() {
    this.clearCacheAndServiceWorker();
    this.initTheme();
    this.initEventListeners();
    
    // เริ่มต้นตัวควบคุมกราฟ
    window.chartCtrl.init('historyChart');

    // จัดตำแหน่งเส้นแถบเลื่อนสลับแท็บ (Smooth Tab Glider)
    requestAnimationFrame(() => {
      this.updateTabGlider('overview');
    });

    // โหลดข้อมูลรอบแรกทันที พร้อมเปิด Loading กราฟ
    this.refreshAll(true);

    // เริ่มระบบ Real-time Polling ซิงค์สดกับบอร์ด
    this.startRealtimeLoop();
  }

  updateTabGlider(tabId = this.currentTab) {
    const glider = document.getElementById('tabGlider');
    const container = document.getElementById('desktopTabBar');
    if (!glider || !container) return;

    const activeBtn = container.querySelector(`.tab-btn[data-tab="${tabId}"]`);
    if (activeBtn) {
      const left = activeBtn.offsetLeft;
      const width = activeBtn.offsetWidth;
      glider.style.width = `${width}px`;
      glider.style.transform = `translateX(${left}px)`;
      glider.style.opacity = '1';
    }
  }

  /* ============================================================
     0. Purge Service Worker & Browser Caches
     ============================================================ */
  clearCacheAndServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          registration.unregister();
        }
      });
    }
    if ('caches' in window) {
      caches.keys().then((names) => {
        for (const name of names) {
          caches.delete(name);
        }
      });
    }
  }

  /* ============================================================
     1. Theme & Appearance
     ============================================================ */
  initTheme() {
    const savedTheme = localStorage.getItem('climate_theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }

  toggleTheme() {
    // ใส่ class ให้ทุก element ค่อยๆ เฟดสีเปลี่ยนธีมอย่างนุ่มนวล
    document.documentElement.classList.add('theme-transition');

    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('climate_theme', isDark ? 'dark' : 'light');

    // อัปเดตกราฟให้สอดคล้องกับธีมใหม่
    window.chartCtrl.setTheme(isDark);

    // ปลด class เมื่อแอนิเมชันเสร็จสิ้น เพื่อไม่ให้กระทบ hover ปกติ
    clearTimeout(this.themeTransitionTimer);
    this.themeTransitionTimer = setTimeout(() => {
      document.documentElement.classList.remove('theme-transition');
    }, 480);
  }

  /* ============================================================
     2. Tab Navigation (Smooth Minimalist Transitions)
     ============================================================ */
  switchTab(tabId) {
    if (this.currentTab === tabId && document.getElementById(`tab-${tabId}`)?.classList.contains('tab-pane-show')) {
      return;
    }
    this.currentTab = tabId;

    // 1. ปรับสไตล์ปุ่มแท็บ Desktop & เลื่อนเส้น Glider อย่างนุ่มนวล
    document.querySelectorAll('.tab-btn').forEach(btn => {
      if (btn.dataset.tab === tabId) {
        btn.classList.add('active', 'text-indigo-600', 'dark:text-indigo-400');
        btn.classList.remove('text-slate-500');
      } else {
        btn.classList.remove('active', 'text-indigo-600', 'dark:text-indigo-400');
        btn.classList.add('text-slate-500');
      }
    });
    this.updateTabGlider(tabId);

    // 2. ปรับสไตล์ปุ่ม Bottom Navigation Mobile
    document.querySelectorAll('.bottom-nav-btn').forEach(btn => {
      if (btn.dataset.tab === tabId) {
        btn.classList.add('active', 'text-indigo-600', 'dark:text-indigo-400');
        btn.classList.remove('text-slate-400');
      } else {
        btn.classList.remove('active', 'text-indigo-600', 'dark:text-indigo-400');
        btn.classList.add('text-slate-400');
      }
    });

    // 3. สลับหน้าเนื้อหาแบบ Smooth Fade & Floating Rise
    const panels = ['overview', 'analytics', 'history'];
    panels.forEach(id => {
      const panel = document.getElementById(`tab-${id}`);
      if (panel) {
        if (id === tabId) {
          panel.classList.remove('hidden');
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              panel.classList.add('tab-pane-show');
            });
          });
        } else {
          panel.classList.remove('tab-pane-show');
          panel.classList.add('hidden');
        }
      }
    });

    // หากเปิดแท็บกราฟ ให้ render กราฟให้เต็มขนาด และโหลดข้อมูลหากยังไม่มี
    if (tabId === 'analytics') {
      window.chartCtrl.ensureRendered();
      if (!this.historyData || this.historyData.length === 0) {
        this.loadHistoryData(true);
      }
    }
  }

  /* ============================================================
     3. Realtime Polling Loop
     ============================================================ */
  startRealtimeLoop() {
    if (this.latestTimer) clearInterval(this.latestTimer);
    if (this.historyTimer) clearInterval(this.historyTimer);

    // ดึงค่าล่าสุดจากบอร์ดทุกๆ 4 วินาที เพื่อให้อัปเดตสดแบบเรียลไทม์
    this.latestTimer = setInterval(() => {
      this.fetchLatestData();
    }, 4000);

    // ดึงประวัติทุกๆ 30 วินาทีเพื่ออัปเดตสถิติและกราฟ
    this.historyTimer = setInterval(() => {
      this.loadHistoryData(false);
    }, 30000);
  }

  async refreshAll(showChartLoading = false) {
    // โหลดข้อมูลแบบเงียบๆ ไม่แสดงสถานะโหลดบน Badge เพื่อความสะอาดตา
    await Promise.all([
      this.fetchLatestData(),
      this.loadHistoryData(showChartLoading)
    ]);
  }

  // ตรวจสอบว่าบอร์ด ESP32 ยังเสียบส่งข้อมูลอยู่หรือไม่ (บอร์ดส่งทุกๆ ~5 นาที หากเกิน 7.5 นาที ถือว่าออฟไลน์)
  isBoardOnline(timestampStr) {
    if (!timestampStr) return false;
    try {
      let recordTime = null;
      const trimmed = timestampStr.trim();
      if (trimmed.includes(' ') || trimmed.includes('T')) {
        const parts = trimmed.split(/[ T]/);
        const datePart = parts[0];
        const timePart = parts[1];
        let y, m, d;
        if (datePart.includes('-')) {
          const dp = datePart.split('-');
          y = parseInt(dp[0], 10);
          m = parseInt(dp[1], 10) - 1;
          d = parseInt(dp[2], 10);
        } else if (datePart.includes('/')) {
          const dp = datePart.split('/');
          d = parseInt(dp[0], 10);
          m = parseInt(dp[1], 10) - 1;
          y = parseInt(dp[2], 10);
        }
        if (timePart) {
          const tp = timePart.split(':');
          const hh = parseInt(tp[0], 10);
          const mm = parseInt(tp[1], 10);
          const ss = tp.length > 2 ? parseInt(tp[2], 10) : 0;
          recordTime = new Date(y, m, d, hh, mm, ss);
        }
      } else if (trimmed.includes(':')) {
        const tp = trimmed.split(':');
        const now = new Date();
        recordTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(tp[0], 10), parseInt(tp[1], 10));
      }

      if (recordTime && !isNaN(recordTime.getTime())) {
        const diffSeconds = (Date.now() - recordTime.getTime()) / 1000;
        // หากส่งมาภายใน 450 วินาที (7.5 นาที) ถือว่าบอร์ดเสียบอยู่และออนไลน์
        return diffSeconds >= 0 && diffSeconds <= 450;
      }
    } catch (e) {
      console.warn('Timestamp check error:', e);
    }
    return true;
  }

  async fetchLatestData() {
    if (this.isFetchingLatest) return;
    this.isFetchingLatest = true;

    try {
      const resp = await window.apiService.fetchLatest();
      if (resp && resp.status === 'success') {
        if (this.latestData) {
          this.previousData = { ...this.latestData };
        }
        this.latestData = resp;
        this.renderLatestData(resp);

        // ตรวจสอบว่าบอร์ด ESP32 ยังเสียบอยู่หรือไม่
        const online = this.isBoardOnline(resp.timestamp);
        this.updateConnectionBadge(online);
      } else {
        this.updateConnectionBadge(false);
      }
    } catch (err) {
      console.warn('Realtime fetch error:', err);
      this.updateConnectionBadge(false);
    } finally {
      this.isFetchingLatest = false;
    }
  }

  async loadHistoryData(showLoading = false) {
    if (showLoading) {
      window.chartCtrl.setLoading(true);
    }

    try {
      const resp = await window.apiService.fetchHistory();
      if (resp && resp.status === 'success' && Array.isArray(resp.data)) {
        this.historyData = resp.data;
        window.chartCtrl.updateData(this.historyData);
        this.renderHistoryTable(this.historyData);
        this.renderStatistics(this.historyData);
      } else {
        if (showLoading) {
          window.chartCtrl.setError('ไม่พบข้อมูลประวัติในระบบ');
        }
      }
    } catch (err) {
      console.warn('Load history error:', err);
      if (showLoading) {
        window.chartCtrl.setError('โหลดข้อมูลกราฟไม่สำเร็จ: ' + (err.message || 'เครือข่ายขัดข้อง'));
      }
    } finally {
      if (showLoading) {
        window.chartCtrl.setLoading(false);
      }
    }
  }

  updateConnectionBadge(isOnline) {
    const badge = document.getElementById('connectionBadge');
    if (!badge) return;

    if (isOnline) {
      // ออนไลน์สีเขียว แสดง "ออนไลน์" เฉยๆ (Apple/Tesla Status Pill)
      badge.className = 'inline-flex items-center px-2.5 sm:px-3 py-1 rounded-full text-[11px] sm:text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60 shadow-xs transition-all duration-300';
      badge.innerHTML = '<span class="w-2 h-2 mr-1.5 rounded-full bg-emerald-500 animate-pulse shadow-xs"></span>ออนไลน์';
    } else {
      // ถอดบอร์ดออก / ออฟไลน์ เป็นสีเทาเรียบหรู
      badge.className = 'inline-flex items-center px-2.5 sm:px-3 py-1 rounded-full text-[11px] sm:text-xs font-semibold bg-slate-100 text-slate-600 dark:bg-slate-800/80 dark:text-slate-400 border border-slate-200 dark:border-slate-700/60 shadow-xs transition-all duration-300';
      badge.innerHTML = '<span class="w-2 h-2 mr-1.5 rounded-full bg-slate-400"></span>ออฟไลน์';
    }
  }

  /* ============================================================
     4. Smooth Number Animation (ทีละ 0.1 แบบเนียนตา)
     ============================================================ */
  animateNumber(elementId, startVal, targetVal, duration = 800) {
    const el = document.getElementById(elementId);
    if (!el) return;

    startVal = Number(startVal);
    targetVal = Number(targetVal);

    if (isNaN(startVal) || isNaN(targetVal)) {
      el.innerText = isNaN(targetVal) ? '--' : targetVal.toFixed(1);
      return;
    }

    if (Math.abs(startVal - targetVal) < 0.05) {
      el.innerText = targetVal.toFixed(1);
      return;
    }

    // ยกเลิก animation เดิมที่กำลังทำงานอยู่บน element นี้ (ถ้ามี)
    if (this.animFrames[elementId]) {
      cancelAnimationFrame(this.animFrames[elementId]);
    }

    const startTime = performance.now();
    const diff = targetVal - startVal;

    const tick = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Smooth ease-out cubic
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = startVal + (diff * ease);

      // แสดงทศนิยม 1 ตำแหน่ง ปรับตัวเลขทีละ 0.1 อย่างเนียนตา
      el.innerText = current.toFixed(1);

      if (progress < 1) {
        this.animFrames[elementId] = requestAnimationFrame(tick);
      } else {
        el.innerText = targetVal.toFixed(1);
        delete this.animFrames[elementId];
      }
    };

    this.animFrames[elementId] = requestAnimationFrame(tick);
  }

  /* ============================================================
     5. Render Dashboard Cards & Physics Indexes
     ============================================================ */
  renderLatestData(data) {
    const temp = Number(data.temperature);
    const humid = Number(data.humidity);

    // คำนวณ Heat Index และ Dew Point
    const heatIndex = this.calculateHeatIndex(temp, humid);
    const dewPoint = this.calculateDewPoint(temp, humid);

    // แอนิเมชันตัวเลขขึ้น/ลง แบบสมูททีละ 0.1 ทั้ง 4 ตัวเลข
    const animateMetric = (id, key, targetVal, fallbackStart) => {
      const startVal = this.currentNumbers[key] !== null ? this.currentNumbers[key] : fallbackStart;
      this.animateNumber(id, startVal, targetVal, 900);
      this.currentNumbers[key] = targetVal;
    };

    // หากเปิดโปรแกรมครั้งแรก ให้ค่อยๆ ไต่ขึ้นมาอย่างเนียนตา
    animateMetric('tempValue', 'temp', temp, Math.max(0, temp - 2.5));
    animateMetric('humidValue', 'humid', humid, Math.max(0, humid - 4.0));
    animateMetric('heatIndexValue', 'heatIndex', heatIndex, Math.max(0, heatIndex - 2.5));
    animateMetric('dewPointValue', 'dewPoint', dewPoint, Math.max(0, dewPoint - 2.5));

    // อัปเดตแถบวัดระดับ Micro Gauge Meter (สไตล์ Smart Dashboard)
    const tempPct = Math.min(100, Math.max(0, ((temp - 15) / 30) * 100)); // ช่วงอุณหภูมิห้องปกติ 15°C - 45°C
    const humidPct = Math.min(100, Math.max(0, humid)); // ช่วงความชื้น 0% - 100%
    const tempBar = document.getElementById('tempProgressBar');
    if (tempBar) tempBar.style.width = `${tempPct}%`;
    const humidBar = document.getElementById('humidProgressBar');
    if (humidBar) humidBar.style.width = `${humidPct}%`;

    const updatedText = document.getElementById('lastUpdatedText');
    if (updatedText) {
      updatedText.innerText = `ข้อมูลล่าสุดเมื่อ: ${data.timestamp}`;
    }

    // Delta จากรอบก่อน
    if (this.previousData) {
      const tempDiff = temp - Number(this.previousData.temperature);
      const humidDiff = humid - Number(this.previousData.humidity);
      this.renderDelta('tempDelta', tempDiff, '°C');
      this.renderDelta('humidDelta', humidDiff, '%');
    }

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
    if (T < 27) return T;
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

    // สรุปสภาวะห้องโดยรวม
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
     7. History Table & Date/Time Filter
     ============================================================ */
  parseHistoryDateTime(r) {
    let dateStr = '';
    let timeStr = '';

    if (r.date && r.time) {
      if (r.date.includes('/')) {
        const p = r.date.split('/');
        dateStr = (p[2]?.length === 4) ? `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}` : r.date;
      } else {
        dateStr = r.date;
      }
      timeStr = r.time.slice(0, 5);
    } else if (r.timestamp) {
      const parts = r.timestamp.trim().split(/[ T]/);
      if (parts.length >= 2) {
        if (parts[0].includes('-')) {
          dateStr = parts[0];
        } else if (parts[0].includes('/')) {
          const p = parts[0].split('/');
          dateStr = `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
        }
        timeStr = parts[1].slice(0, 5);
      } else {
        timeStr = parts[0].slice(0, 5);
        const latestTs = this.latestData?.timestamp;
        if (latestTs && (latestTs.includes(' ') || latestTs.includes('T'))) {
          dateStr = latestTs.split(/[ T]/)[0];
        } else {
          const now = new Date();
          const y = now.getFullYear();
          const m = String(now.getMonth() + 1).padStart(2, '0');
          const d = String(now.getDate()).padStart(2, '0');
          dateStr = `${y}-${m}-${d}`;
        }
      }
    }

    return { date: dateStr, time: timeStr };
  }

  formatTimestampForDisplay(r) {
    if (r.date && r.time) {
      return `${r.date} ${r.time}`;
    }
    if (r.timestamp && r.timestamp.includes(' ')) {
      return r.timestamp;
    }
    const parsed = this.parseHistoryDateTime(r);
    return `${parsed.date} ${parsed.time}`;
  }

  renderHistoryTable(data) {
    this.filterHistoryTable();
  }

  filterHistoryTable() {
    const tbody = document.getElementById('historyTableBody');
    const badge = document.getElementById('historyRowCountBadge');
    if (!tbody || !this.historyData) return;

    const dateVal = document.getElementById('historyDateInput')?.value || '';
    const startVal = document.getElementById('historyStartTimeInput')?.value || '';
    const endVal = document.getElementById('historyEndTimeInput')?.value || '';
    const searchVal = document.getElementById('historySearchInput')?.value?.toLowerCase().trim() || '';

    let rows = [...this.historyData].reverse(); // เอาล่าสุดขึ้นก่อน

    rows = rows.filter(r => {
      const parsed = this.parseHistoryDateTime(r);

      // 1. กรองตามวันที่เลือก
      if (dateVal && parsed.date) {
        if (parsed.date !== dateVal) return false;
      }

      // 2. กรองเวลาเริ่มต้น
      if (startVal && parsed.time) {
        if (parsed.time < startVal) return false;
      }

      // 3. กรองเวลาสิ้นสุด
      if (endVal && parsed.time) {
        if (parsed.time > endVal) return false;
      }

      // 4. กรองตามคำค้นหา
      if (searchVal) {
        const fullDisplay = this.formatTimestampForDisplay(r).toLowerCase();
        if (!fullDisplay.includes(searchVal)) return false;
      }

      return true;
    });

    this.filteredHistoryRows = rows;

    if (badge) {
      if (dateVal || startVal || endVal || searchVal) {
        badge.innerText = `แสดง ${rows.length} จาก ${this.historyData.length} รายการ (ตามตัวกรอง)`;
      } else {
        badge.innerText = `พบทั้งหมด ${this.historyData.length} รายการจาก Google Sheets`;
      }
    }

    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="px-4 py-8 text-center text-slate-400">ไม่พบข้อมูลที่ตรงกับเงื่อนไขวันและเวลาที่เลือก</td></tr>`;
      return;
    }

    const displayLimit = this.showAllHistory || dateVal || startVal || endVal || searchVal ? rows.length : 50;
    const visibleRows = rows.slice(0, displayLimit);

    let html = visibleRows.map((r, idx) => `
      <tr class="border-b border-slate-100 dark:border-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
        <td class="px-3 sm:px-4 py-2.5 sm:py-3 text-slate-400 dark:text-slate-500 text-xs text-center">${idx + 1}</td>
        <td class="px-3 sm:px-4 py-2.5 sm:py-3 font-medium text-slate-800 dark:text-slate-200 text-xs sm:text-sm whitespace-nowrap">
          📅 ${this.formatTimestampForDisplay(r)}
        </td>
        <td class="px-3 sm:px-4 py-2.5 sm:py-3 text-rose-600 dark:text-rose-400 font-semibold text-xs sm:text-sm tabular-nums">
          ${Number(r.temperature).toFixed(1)} °C
        </td>
        <td class="px-3 sm:px-4 py-2.5 sm:py-3 text-sky-600 dark:text-sky-400 font-semibold text-xs sm:text-sm tabular-nums">
          ${Number(r.humidity).toFixed(1)} %
        </td>
      </tr>
    `).join('');

    if (rows.length > displayLimit) {
      html += `
        <tr>
          <td colspan="4" class="p-3 text-center bg-slate-50/50 dark:bg-slate-800/30">
            <button id="showAllHistoryBtn" type="button" class="px-4 py-1.5 text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/70 dark:hover:bg-indigo-900/80 text-indigo-600 dark:text-indigo-400 rounded-lg transition active:scale-95 shadow-2xs">
              + แสดงข้อมูลทั้งหมดที่เหลือ (${rows.length - displayLimit} รายการ)
            </button>
          </td>
        </tr>
      `;
    }

    tbody.innerHTML = html;

    const showAllBtn = document.getElementById('showAllHistoryBtn');
    if (showAllBtn) {
      showAllBtn.addEventListener('click', () => {
        this.showAllHistory = true;
        this.filterHistoryTable();
      });
    }
  }

  resetHistoryFilter() {
    const dInput = document.getElementById('historyDateInput');
    const sInput = document.getElementById('historyStartTimeInput');
    const eInput = document.getElementById('historyEndTimeInput');
    const qInput = document.getElementById('historySearchInput');

    if (dInput) dInput.value = '';
    if (sInput) sInput.value = '';
    if (eInput) eInput.value = '';
    if (qInput) qInput.value = '';

    this.filterHistoryTable();
  }

  /* ============================================================
     8. Data Export (CSV)
     ============================================================ */
  exportCSV() {
    const rowsToExport = (this.filteredHistoryRows && this.filteredHistoryRows.length > 0)
      ? this.filteredHistoryRows
      : this.historyData;

    if (!rowsToExport || rowsToExport.length === 0) {
      alert('ยังไม่มีข้อมูลสำหรับส่งออก');
      return;
    }

    let csvContent = '\uFEFFDate & Time,Temperature (C),Humidity (%)\r\n';
    rowsToExport.forEach(row => {
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

  /* ============================================================
     9. Event Listeners
     ============================================================ */
  initEventListeners() {
    // Desktop Tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
    });

    // Window resize -> ปรับขนาดและตำแหน่ง Tab Glider อัตโนมัติ
    window.addEventListener('resize', () => this.updateTabGlider());

    // Mobile Bottom Navigation buttons
    document.querySelectorAll('.bottom-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
    });

    // Refresh button บน Header
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', () => this.refreshAll(true));

    // Theme toggle button
    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) themeBtn.addEventListener('click', () => this.toggleTheme());

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

    // Chart View Mode Selector (เลือกช่วงจุด หรือเลือกแบบวันที่/เวลา)
    const viewModeSelect = document.getElementById('chartViewModeSelect');
    if (viewModeSelect) {
      viewModeSelect.addEventListener('change', (e) => {
        window.chartCtrl.setViewMode(e.target.value);
      });
    }

    // Apply Custom Date & Time Filter button & Auto change
    const onChartDateTimeChange = () => {
      const dateVal = document.getElementById('chartDateInput')?.value || '';
      const startVal = document.getElementById('chartStartTimeInput')?.value || '';
      const endVal = document.getElementById('chartEndTimeInput')?.value || '';
      window.chartCtrl.setCustomFilter(dateVal, startVal, endVal);
    };

    const applyCustomBtn = document.getElementById('applyCustomFilterBtn');
    if (applyCustomBtn) {
      applyCustomBtn.addEventListener('click', onChartDateTimeChange);
    }

    const chartDateInput = document.getElementById('chartDateInput');
    if (chartDateInput) {
      chartDateInput.addEventListener('change', onChartDateTimeChange);
    }

    const chartStartTimeInput = document.getElementById('chartStartTimeInput');
    if (chartStartTimeInput) {
      chartStartTimeInput.addEventListener('change', onChartDateTimeChange);
    }

    const chartEndTimeInput = document.getElementById('chartEndTimeInput');
    if (chartEndTimeInput) {
      chartEndTimeInput.addEventListener('change', onChartDateTimeChange);
    }

    // Reset Custom Filter button
    const resetCustomBtn = document.getElementById('resetCustomFilterBtn');
    if (resetCustomBtn) {
      resetCustomBtn.addEventListener('click', () => {
        window.chartCtrl.resetCustomFilter();
      });
    }

    // Chart Reload button (ปุ่มโหลดกราฟใหม่)
    const reloadChartBtn = document.getElementById('reloadChartBtn');
    if (reloadChartBtn) {
      reloadChartBtn.addEventListener('click', () => {
        this.loadHistoryData(true);
      });
    }

    // Chart Retry button (ปุ่มลองใหม่อีกครั้ง)
    const retryChartBtn = document.getElementById('retryChartBtn');
    if (retryChartBtn) {
      retryChartBtn.addEventListener('click', () => {
        this.loadHistoryData(true);
      });
    }

    // Chart Download Image button (ปุ่มบันทึกภาพกราฟ)
    const downloadChartBtn = document.getElementById('downloadChartBtn');
    if (downloadChartBtn) {
      downloadChartBtn.addEventListener('click', () => {
        window.chartCtrl.downloadImage();
      });
    }

    // History Table Date/Time and Search Filters
    const historyDateInput = document.getElementById('historyDateInput');
    if (historyDateInput) {
      historyDateInput.addEventListener('change', () => this.filterHistoryTable());
    }

    const historyStartTimeInput = document.getElementById('historyStartTimeInput');
    if (historyStartTimeInput) {
      historyStartTimeInput.addEventListener('change', () => this.filterHistoryTable());
    }

    const historyEndTimeInput = document.getElementById('historyEndTimeInput');
    if (historyEndTimeInput) {
      historyEndTimeInput.addEventListener('change', () => this.filterHistoryTable());
    }

    const historySearchInput = document.getElementById('historySearchInput');
    if (historySearchInput) {
      historySearchInput.addEventListener('input', () => this.filterHistoryTable());
    }

    const resetHistoryFilterBtn = document.getElementById('resetHistoryFilterBtn');
    if (resetHistoryFilterBtn) {
      resetHistoryFilterBtn.addEventListener('click', () => this.resetHistoryFilter());
    }

    // Export CSV button
    const exportCsvBtn = document.getElementById('exportCsvBtn');
    if (exportCsvBtn) exportCsvBtn.addEventListener('click', () => this.exportCSV());

    // Window Resize & Orientation Change (หมุนหน้าจอโทรศัพท์/แท็บเล็ต)
    window.addEventListener('resize', () => {
      if (window.chartCtrl && window.chartCtrl.chart) {
        window.chartCtrl.chart.resize();
      }
    });

    window.addEventListener('orientationchange', () => {
      setTimeout(() => {
        if (window.chartCtrl && window.chartCtrl.chart) {
          window.chartCtrl.chart.resize();
        }
      }, 150);
    });
  }
}

// Start app on DOM load
window.addEventListener('DOMContentLoaded', () => {
  window.climateApp = new ClimateApp();
  window.climateApp.init();
});
