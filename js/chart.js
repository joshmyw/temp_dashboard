/**
 * Chart Controller using Chart.js with Date & Time formatting
 */
class ChartController {
  constructor() {
    this.chart = null;
    this.activeFilter = 'all'; // 'all', 'temp', 'humid'
    this.rawData = [];
    this.currentSlicedData = [];
    this.limit = 20;
  }

  formatLabel(item) {
    if (!item) return '';
    let dateStr = '';
    let timeStr = '';

    if (item.date && item.time) {
      dateStr = item.date.slice(0, 5); // dd/MM
      timeStr = item.time;
    } else if (item.timestamp) {
      const parts = item.timestamp.trim().split(/[ T]/);
      if (parts.length >= 2) {
        // เช่น "2026-11-12 11:38" หรือ "12/11/2026 11:38"
        const datePart = parts[0];
        timeStr = parts[1].slice(0, 5);
        if (datePart.includes('-')) {
          const dParts = datePart.split('-');
          dateStr = `${dParts[2]}/${dParts[1]}`; // dd/MM
        } else if (datePart.includes('/')) {
          dateStr = datePart.slice(0, 5);
        } else {
          dateStr = datePart;
        }
      } else {
        // มีเฉพาะเวลา เช่น "11:38"
        timeStr = parts[0].slice(0, 5);
        // ดึงวันที่จาก latestData หรือวันที่ปัจจุบัน
        if (window.climateApp && window.climateApp.latestData && window.climateApp.latestData.timestamp) {
          const latestParts = window.climateApp.latestData.timestamp.split(/[ T]/);
          if (latestParts[0].includes('-')) {
            const lp = latestParts[0].split('-');
            dateStr = `${lp[2]}/${lp[1]}`;
          } else {
            dateStr = latestParts[0].slice(0, 5);
          }
        } else {
          const now = new Date();
          const d = String(now.getDate()).padStart(2, '0');
          const m = String(now.getMonth() + 1).padStart(2, '0');
          dateStr = `${d}/${m}`;
        }
      }
    }

    // คืนค่าเป็น Array 2 บรรทัด (บรรทัดแรก: วันที่ dd/MM, บรรทัดสอง: เวลา HH:mm)
    return [dateStr, timeStr];
  }

  formatFullDateTime(item) {
    if (!item) return '';
    if (item.date && item.time) {
      return `${item.date} เวลา ${item.time} น.`;
    }
    if (item.timestamp) {
      const parts = item.timestamp.trim().split(/[ T]/);
      if (parts.length >= 2) {
        return `${parts[0]} เวลา ${parts[1]} น.`;
      }
      const datePrefix = window.climateApp?.latestData?.timestamp?.split(/[ T]/)[0] || new Date().toISOString().slice(0, 10);
      return `${datePrefix} เวลา ${parts[0]} น.`;
    }
    return '';
  }

  init(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

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
            borderColor: '#f43f5e',
            backgroundColor: 'rgba(244, 63, 94, 0.15)',
            borderWidth: 2.5,
            pointRadius: 3.5,
            pointHoverRadius: 6,
            pointBackgroundColor: '#f43f5e',
            tension: 0.35,
            fill: true,
            yAxisID: 'yTemp',
            data: []
          },
          {
            label: 'ความชื้น (%)',
            borderColor: '#0284c7',
            backgroundColor: 'rgba(2, 132, 199, 0.15)',
            borderWidth: 2.5,
            pointRadius: 3.5,
            pointHoverRadius: 6,
            pointBackgroundColor: '#0284c7',
            tension: 0.35,
            fill: true,
            yAxisID: 'yHumid',
            data: []
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
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
              pointStyle: 'circle'
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
              maxTicksLimit: 12
            }
          },
          yTemp: {
            type: 'linear',
            position: 'left',
            grid: { color: gridColor },
            ticks: {
              color: '#f43f5e',
              font: { family: 'Kanit' }
            },
            title: {
              display: true,
              text: 'อุณหภูมิ (°C)',
              color: '#f43f5e',
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
              color: '#0284c7',
              font: { family: 'Kanit' }
            },
            title: {
              display: true,
              text: 'ความชื้น (%)',
              color: '#0284c7',
              font: { family: 'Kanit', size: 11 }
            },
            suggestedMin: 30,
            suggestedMax: 90
          }
        }
      }
    });
  }

  updateData(historyData, limit = null) {
    if (!historyData || !Array.isArray(historyData)) return;
    this.rawData = historyData;
    if (limit) this.limit = limit;

    this.currentSlicedData = this.rawData.slice(-this.limit);
    if (!this.chart) return;

    this.chart.data.labels = this.currentSlicedData.map(d => this.formatLabel(d));
    this.chart.data.datasets[0].data = this.currentSlicedData.map(d => d.temperature);
    this.chart.data.datasets[1].data = this.currentSlicedData.map(d => d.humidity);

    this.applyFilterVisibility();
    this.chart.update();
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
}

window.chartCtrl = new ChartController();
