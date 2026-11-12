/**
 * API Service for Google Apps Script Web App
 */
const DEFAULT_GAS_URL = "https://script.google.com/macros/s/AKfycbxzQzjHamGP6LQFzTq0T6mk8TjusPAhciPwOwaxGNkoKH2OLkHWovSoxUqY-VaqAEGw/exec";

class ApiService {
  constructor() {
    this.storageKey = 'climate_gas_api_url';
  }

  getApiUrl() {
    const saved = localStorage.getItem(this.storageKey);
    return (saved && saved.trim() !== '') ? saved.trim() : DEFAULT_GAS_URL;
  }

  setApiUrl(url) {
    if (url && url.trim() !== '') {
      localStorage.setItem(this.storageKey, url.trim());
    } else {
      localStorage.removeItem(this.storageKey);
    }
  }

  resetApiUrl() {
    localStorage.removeItem(this.storageKey);
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

  async fetchHistory(limit = 50) {
    const baseUrl = this.getApiUrl();
    const url = `${baseUrl}?action=history&limit=${limit}&t=${Date.now()}`;
    return await this.fetchWithTimeout(url);
  }

  async testConnection(testUrl) {
    try {
      const targetUrl = (testUrl && testUrl.trim()) ? testUrl.trim() : this.getApiUrl();
      const url = `${targetUrl}?action=latest&t=${Date.now()}`;
      const data = await this.fetchWithTimeout(url, 10000);
      if (data && data.status === 'success') {
        return { success: true, data };
      }
      return { success: false, message: data.message || 'ไม่มีข้อมูลในสเปรดชีต' };
    } catch (err) {
      return { success: false, message: err.message || 'เชื่อมต่อไม่สำเร็จ' };
    }
  }
}

window.apiService = new ApiService();
