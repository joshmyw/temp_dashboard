/**
 * API Service for Google Apps Script Web App
 */
const DEFAULT_GAS_URL = "https://script.google.com/macros/s/AKfycbxzQzjHamGP6LQFzTq0T6mk8TjusPAhciPwOwaxGNkoKH2OLkHWovSoxUqY-VaqAEGw/exec";

class ApiService {
  constructor() {
    // ล้างค่าที่เคยถูกบันทึกใน localStorage ออก เพื่อป้องกันไม่ให้มีใครแก้ไข URL
    try {
      localStorage.removeItem('climate_gas_api_url');
    } catch (e) {}
  }

  getApiUrl() {
    return DEFAULT_GAS_URL;
  }

  async fetchWithTimeout(url, timeoutMs = 12000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        cache: 'no-store'
      });
      clearTimeout(id);
      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      clearTimeout(id);
      if (error.name === 'AbortError') {
        throw new Error('การเชื่อมต่อหมดเวลา (Timeout)');
      }
      throw error;
    }
  }

  async fetchLatest() {
    const baseUrl = this.getApiUrl();
    const url = `${baseUrl}?action=latest&t=${Date.now()}`;
    return await this.fetchWithTimeout(url);
  }

  async fetchHistory(limit = 'all') {
    const baseUrl = this.getApiUrl();
    const url = `${baseUrl}?action=history&limit=${limit}&t=${Date.now()}`;
    return await this.fetchWithTimeout(url);
  }
}

window.apiService = new ApiService();
