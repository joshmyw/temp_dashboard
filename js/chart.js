/**
 * Chart Controller using Chart.js with Date & Time filtering & formatting
 */
class ChartController {
  constructor() {
    this.chart = null;
    this.activeFilter = 'all'; // 'all', 'temp', 'humid'
    this.rawData = [];
    this.currentSlicedData = [];
    this.viewMode = 'custom'; // 'custom', 'all', 'latest10', 'latest20', 'latest50'
    this.customDate = '';
    this.customStartTime = '';
    this.customEndTime = '';
    this.canvasId = 'historyChart';
  }

  parseItemDateTime(item) {
    if (!item) return { date: '', time: '' };

    let dateStr = '';
    let timeStr = '';

    if (item.date && item.time) {
      if (item.date.includes('/')) {
        const p = item.date.split('/');
        dateStr = (p[2]?.length === 4) ? `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}` : item.date;
      } else {
        dateStr = item.date;
      }
      timeStr = item.time.slice(0, 5);
    } else if (item.timestamp) {
      const parts = item.timestamp.trim().split(/[ T]/);
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
        const latestTs = window.climateApp?.latestData?.timestamp;
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

  formatLabel(item) {
    if (!item) return '';
    const parsed = this.parseItemDateTime(item);
    let dateLabel = '';
    if (parsed.date) {
      const p = parsed.date.split('-');
      if (p.length === 3) dateLabel = `${p[2]}/${p[1]}`;
    }
    return [dateLabel, parsed.time];
  }

  formatFullDateTime(item) {
    if (!item) return '';
    const parsed = this.parseItemDateTime(item);
    return `${parsed.date} เวลา ${parsed.time} น.`;
  }

  init(canvasId = 'historyChart') {
    this.canvasId = canvasId;
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }

    const ctx = canvas.getContext('2d');
    const isDark = document.documentElement.classList.contains('dark');
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
    const textColor = isDark ? '#94a3b8' : '#64748b';

    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'อุณหภูมิ (°C)',
            borderColor: '#ff5722',
            backgroundColor: 'rgba(255, 87, 34, 0.10)',
            borderWidth: 2.2,
            pointRadius: 0,
            pointHoverRadius: 5,
            pointHitRadius: 10,
            pointBackgroundColor: '#ff5722',
            tension: 0.35,
            fill: true,
            spanGaps: true,
            yAxisID: 'yTemp',
            data: []
          },
          {
            label: 'ความชื้น (%)',
            borderColor: '#00a6f4',
            backgroundColor: 'rgba(0, 166, 244, 0.10)',
            borderWidth: 2.2,
            pointRadius: 0,
            pointHoverRadius: 5,
            pointHitRadius: 10,
            pointBackgroundColor: '#00a6f4',
            tension: 0.35,
            fill: true,
            spanGaps: true,
            yAxisID: 'yHumid',
            data: []
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        normalized: true,
        elements: {
          point: {
            radius: 0,
            hoverRadius: 5,
            hitRadius: 10
          },
          line: {
            tension: 0.35
          }
        },
        animation: {
          duration: 320,
          easing: 'easeOutQuart'
        },
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: {
              color: textColor,
              font: { family: 'Kanit', size: 12 },
              usePointStyle: true,
              pointStyle: 'line'
            }
          },
          tooltip: {
            backgroundColor: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
            titleColor: isDark ? '#f8fafc' : '#0f172a',
            bodyColor: isDark ? '#cbd5e1' : '#334155',
            borderColor: isDark ? '#334155' : '#e2e8f0',
            borderWidth: 1,
            padding: 10,
            titleFont: { family: 'Kanit', weight: 'bold', size: 13 },
            bodyFont: { family: 'Kanit', size: 12 },
            callbacks: {
              title: (tooltipItems) => {
                if (!tooltipItems || tooltipItems.length === 0) return '';
                const idx = tooltipItems[0].dataIndex;
                const item = this.currentSlicedData[idx];
                return item ? `📅 ${this.formatFullDateTime(item)}` : '';
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: gridColor },
            ticks: {
              color: textColor,
              font: { family: 'Kanit', size: 11 },
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 14
            }
          },
          yTemp: {
            type: 'linear',
            position: 'left',
            grid: { color: gridColor },
            ticks: {
              color: '#ff5722',
              font: { family: 'Kanit' }
            },
            title: {
              display: true,
              text: 'อุณหภูมิ (°C)',
              color: '#ff5722',
              font: { family: 'Kanit', size: 11 }
            },
            suggestedMin: 20,
            suggestedMax: 40
          },
          yHumid: {
            type: 'linear',
            position: 'right',
            grid: { drawOnChartArea: false },
            ticks: {
              color: '#00a6f4',
              font: { family: 'Kanit' }
            },
            title: {
              display: true,
              text: 'ความชื้น (%)',
              color: '#00a6f4',
              font: { family: 'Kanit', size: 11 }
            },
            suggestedMin: 30,
            suggestedMax: 90
          }
        }
      }
    });

    if (this.rawData.length > 0) {
      this.applyFilters();
    }
  }

  ensureRendered() {
    if (!this.chart) {
      this.init(this.canvasId);
    } else {
      requestAnimationFrame(() => {
        if (this.chart) {
          this.chart.resize();
          this.chart.update('none');
        }
      });
    }
  }

  setLoading(isLoading) {
    const overlay = document.getElementById('chartLoadingOverlay');
    const errState = document.getElementById('chartErrorState');
    if (overlay) {
      if (isLoading) {
        overlay.classList.remove('hidden');
        overlay.style.opacity = '1';
        if (errState) errState.classList.add('hidden');
      } else {
        overlay.style.opacity = '0';
        setTimeout(() => overlay.classList.add('hidden'), 200);
      }
    }
  }

  setError(errorMessage = '') {
    this.setLoading(false);
    const errState = document.getElementById('chartErrorState');
    const errMsg = document.getElementById('chartErrorMessage');
    if (errState) {
      if (errorMessage) {
        if (errMsg) errMsg.innerText = errorMessage;
        errState.classList.remove('hidden');
      } else {
        errState.classList.add('hidden');
      }
    }
  }

  updateData(historyData) {
    if (!historyData || !Array.isArray(historyData)) return;
    this.rawData = historyData;
    this.applyFilters();
  }

  applyFilters() {
    if (!this.rawData || this.rawData.length === 0) return;

    let filtered = [...this.rawData];

    // กรณีเลือกแบบกำหนดวันและเวลาเอง
    if (this.viewMode === 'custom') {
      filtered = filtered.filter(item => {
        const parsed = this.parseItemDateTime(item);

        // 1. กรองวันที่ (ถ้าผู้ใช้เลือก)
        if (this.customDate && parsed.date) {
          if (parsed.date !== this.customDate) return false;
        }

        // 2. กรองเวลาเริ่มต้น (ถ้าผู้ใช้ระบุ)
        if (this.customStartTime && parsed.time) {
          if (parsed.time < this.customStartTime) return false;
        }

        // 3. กรองเวลาสิ้นสุด (ถ้าผู้ใช้ระบุ)
        if (this.customEndTime && parsed.time) {
          if (parsed.time > this.customEndTime) return false;
        }

        return true;
      });
    } else if (this.viewMode === 'latest10') {
      filtered = filtered.slice(-10);
    } else if (this.viewMode === 'latest20') {
      filtered = filtered.slice(-20);
    } else if (this.viewMode === 'latest50') {
      filtered = filtered.slice(-50);
    }
    // ถ้าเป็น 'all' จะใช้ข้อมูลทั้งหมด

    this.currentSlicedData = filtered;

    // อัปเดตป้ายแสดงจำนวนจุดที่พบ
    const countBadge = document.getElementById('chartFilteredCount');
    if (countBadge) {
      countBadge.innerText = `แสดง ${filtered.length} จุด`;
    }

    if (!this.chart) {
      this.init(this.canvasId);
      return;
    }

    if (filtered.length === 0) {
      this.setError('ไม่พบข้อมูลในช่วงวันและเวลาที่เลือก');
      this.chart.data.labels = [];
      this.chart.data.datasets[0].data = [];
      this.chart.data.datasets[1].data = [];
      this.chart.update();
      return;
    }

    this.setError(''); // เคลียร์ข้อความ error เมื่อมีข้อมูล
    this.chart.data.labels = this.currentSlicedData.map(d => this.formatLabel(d));
    this.chart.data.datasets[0].data = this.currentSlicedData.map(d => d.temperature);
    this.chart.data.datasets[1].data = this.currentSlicedData.map(d => d.humidity);

    this.applyFilterVisibility();
    this.chart.update();
  }

  setViewMode(mode) {
    this.viewMode = mode;
    const customContainer = document.getElementById('customDateTimeContainer');
    if (customContainer) {
      if (mode === 'custom') {
        customContainer.classList.remove('hidden');
        // เซ็ตวันที่ปัจจุบันเป็นค่าเริ่มต้น ถ้ายังไม่ได้เลือก
        const dateInput = document.getElementById('chartDateInput');
        if (dateInput && !dateInput.value) {
          const now = new Date();
          const y = now.getFullYear();
          const m = String(now.getMonth() + 1).padStart(2, '0');
          const d = String(now.getDate()).padStart(2, '0');
          dateInput.value = `${y}-${m}-${d}`;
          this.customDate = dateInput.value;
        }
      } else {
        customContainer.classList.add('hidden');
      }
    }
    this.applyFilters();
  }

  setCustomFilter(date, startTime, endTime) {
    this.viewMode = 'custom';
    this.customDate = date || '';
    this.customStartTime = startTime || '';
    this.customEndTime = endTime || '';
    this.applyFilters();
  }

  resetCustomFilter() {
    this.customDate = '';
    this.customStartTime = '';
    this.customEndTime = '';

    const dateInput = document.getElementById('chartDateInput');
    const startInput = document.getElementById('chartStartTimeInput');
    const endInput = document.getElementById('chartEndTimeInput');
    const modeSelect = document.getElementById('chartViewModeSelect');

    if (dateInput) dateInput.value = '';
    if (startInput) startInput.value = '';
    if (endInput) endInput.value = '';

    if (modeSelect) {
      modeSelect.value = 'custom';
    }
    this.viewMode = 'custom';
    this.applyFilters();
  }

  setFilter(filterType) {
    this.activeFilter = filterType;
    this.applyFilterVisibility();
    if (this.chart) this.chart.update();
  }

  applyFilterVisibility() {
    if (!this.chart) return;
    if (this.activeFilter === 'temp') {
      this.chart.data.datasets[0].hidden = false;
      this.chart.data.datasets[1].hidden = true;
      this.chart.options.scales.yHumid.display = false;
      this.chart.options.scales.yTemp.display = true;
    } else if (this.activeFilter === 'humid') {
      this.chart.data.datasets[0].hidden = true;
      this.chart.data.datasets[1].hidden = false;
      this.chart.options.scales.yHumid.display = true;
      this.chart.options.scales.yTemp.display = false;
    } else {
      this.chart.data.datasets[0].hidden = false;
      this.chart.data.datasets[1].hidden = false;
      this.chart.options.scales.yHumid.display = true;
      this.chart.options.scales.yTemp.display = true;
    }
  }

  setTheme(isDark) {
    if (!this.chart) return;
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
    const textColor = isDark ? '#94a3b8' : '#64748b';

    this.chart.options.scales.x.grid.color = gridColor;
    this.chart.options.scales.x.ticks.color = textColor;
    this.chart.options.scales.yTemp.grid.color = gridColor;
    this.chart.options.plugins.legend.labels.color = textColor;

    this.chart.options.plugins.tooltip.backgroundColor = isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)';
    this.chart.options.plugins.tooltip.titleColor = isDark ? '#f8fafc' : '#0f172a';
    this.chart.options.plugins.tooltip.bodyColor = isDark ? '#cbd5e1' : '#334155';
    this.chart.options.plugins.tooltip.borderColor = isDark ? '#334155' : '#e2e8f0';

    this.chart.update();
  }

  async downloadImage(filename = 'climate-chart.png') {
    if (!this.chart || !this.chart.canvas) {
      alert('กราฟยังไม่พร้อมสำหรับการบันทึกภาพ');
      return;
    }

    try {
      const srcCanvas = this.chart.canvas;
      const isDark = document.documentElement.classList.contains('dark');

      // 1. สร้าง Canvas ความละเอียดสูงและเติมพื้นหลังสีทึบ (ป้องกันภาพพื้นหลังดำ/ใสใน iPad Photos)
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = srcCanvas.width;
      exportCanvas.height = srcCanvas.height;
      const ctx = exportCanvas.getContext('2d');

      // เติมสีพื้นหลังตามธีมเพื่อความสวยงาม
      ctx.fillStyle = isDark ? '#0b0f19' : '#ffffff';
      ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

      // วาดกราฟลงบนพื้นหลัง
      ctx.drawImage(srcCanvas, 0, 0);

      // ตรวจสอบว่าเป็นอุปกรณ์ iPad / iPhone / iOS หรือไม่
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

      // 2. แปลงเป็น Blob
      exportCanvas.toBlob(async (blob) => {
        if (!blob) {
          this.fallbackDownload(exportCanvas.toDataURL('image/png'), filename, isIOS);
          return;
        }

        const file = new File([blob], filename, { type: 'image/png' });

        // 3. ใช้ Web Share API สำหรับ iPad / iPhone (เปิดหน้าต่างบันทึกภาพลง Photos หรือ AirDrop โดยตรง)
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              title: 'กราฟสภาพแวดล้อม',
              text: 'กราฟแนวโน้มอุณหภูมิและความชื้น',
              files: [file]
            });
            return;
          } catch (shareErr) {
            if (shareErr.name === 'AbortError') return; // ผู้ใช้กดยกเลิก
            console.warn('Share API error, trying alternative:', shareErr);
          }
        }

        // 4. วิธีมาตรฐานสำหรับเบราว์เซอร์ทั่วไป
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = filename;
        link.href = objectUrl;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();

        setTimeout(() => {
          document.body.removeChild(link);
          URL.revokeObjectURL(objectUrl);
        }, 500);

      }, 'image/png', 1.0);

    } catch (err) {
      console.error('Download chart image error:', err);
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const dataUrl = this.chart.toBase64Image('image/png', 1);
      this.fallbackDownload(dataUrl, filename, isIOS);
    }
  }

  fallbackDownload(dataUrl, filename, isIOS) {
    if (isIOS) {
      // สำหรับ iPad ที่เบราว์เซอร์บล็อกการดาวน์โหลดอัตโนมัติ ให้เปิดภาพขึ้นมาให้แตะค้างบันทึก
      const win = window.open();
      if (win) {
        win.document.write(`
          <!DOCTYPE html>
          <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>${filename}</title>
            <style>
              body { margin: 0; background: #0f172a; color: #fff; font-family: -apple-system, BlinkMacSystemFont, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; padding: 16px; box-sizing: border-box; text-align: center; }
              img { max-width: 100%; height: auto; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
              .tip { margin-top: 16px; font-size: 14px; color: #94a3b8; background: rgba(255,255,255,0.08); padding: 10px 18px; border-radius: 20px; }
            </style>
          </head>
          <body>
            <img src="${dataUrl}" alt="Climate Chart" />
            <div class="tip">💡 แตะที่รูปภาพค้างไว้ แล้วเลือก <b>"บันทึกไปยังแอปรูปภาพ (Save Image)"</b></div>
          </body>
          </html>
        `);
        return;
      }
    }

    const link = document.createElement('a');
    link.download = filename;
    link.href = dataUrl;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => document.body.removeChild(link), 500);
  }
}

window.chartCtrl = new ChartController();
