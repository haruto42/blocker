// HTMLに <script src="device-memo.js"></script> で読み込むと、
// アクセス時の端末情報とIPをlocalStorageへメモする。
// 後でCloudflareへ送る場合は DeviceMemo.getAll() の戻り値を送信すればよい。
(function () {
  "use strict";

  var STORAGE_KEY = "deviceMemo.entries";
  var MAX_ENTRIES = 500; // localStorageの容量超過を避けるための上限
  var IP_API_URL = "https://api64.ipify.org?format=json"; // IPv6/IPv4どちらでも返る
  var IP_TIMEOUT_MS = 5000;

  function loadEntries() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function saveEntries(entries) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
      return true;
    } catch (e) {
      return false;
    }
  }

  function fetchIp() {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, IP_TIMEOUT_MS);
    return fetch(IP_API_URL, { signal: controller.signal })
      .then(function (res) { return res.json(); })
      .then(function (json) { return json.ip || null; })
      .catch(function () { return null; }) // オフライン・広告ブロック等で失敗しても記録は続ける
      .then(function (ip) { clearTimeout(timer); return ip; });
  }

  // 機種名などは高エントロピー値として要求しないと取れない(Chrome系のみ対応)
  function fetchClientHints() {
    var uad = navigator.userAgentData;
    if (!uad || !uad.getHighEntropyValues) return Promise.resolve(null);
    return uad
      .getHighEntropyValues(["model", "platformVersion", "architecture", "bitness", "fullVersionList"])
      .then(function (h) {
        return {
          mobile: uad.mobile,
          platform: uad.platform,
          model: h.model,
          platformVersion: h.platformVersion,
          architecture: h.architecture,
          bitness: h.bitness,
          brands: h.fullVersionList
        };
      })
      .catch(function () { return null; });
  }

  function collectBasic() {
    var conn = navigator.connection || {};
    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      languages: navigator.languages ? Array.prototype.slice.call(navigator.languages) : [],
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timezoneOffsetMin: new Date().getTimezoneOffset(),
      screen: { width: screen.width, height: screen.height, colorDepth: screen.colorDepth },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      devicePixelRatio: window.devicePixelRatio,
      touchPoints: navigator.maxTouchPoints,
      cpuCores: navigator.hardwareConcurrency,
      memoryGB: navigator.deviceMemory,
      connection: { type: conn.effectiveType, downlinkMbps: conn.downlink, saveData: conn.saveData },
      cookieEnabled: navigator.cookieEnabled,
      doNotTrack: navigator.doNotTrack,
      referrer: document.referrer,
      url: location.href
    };
  }

  // 情報を集めて1件メモする。note は任意の手書きメモ。
  function record(note) {
    return Promise.all([fetchIp(), fetchClientHints()]).then(function (results) {
      var entry = collectBasic();
      entry.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      entry.recordedAt = new Date().toISOString();
      entry.ip = results[0];
      entry.clientHints = results[1];
      entry.note = note || "";
      var entries = loadEntries();
      entries.push(entry);
      saveEntries(entries);
      return entry;
    });
  }

  // 未送信の記録をCloudflare Functionsへ送る。送信成功分だけ synced を付ける。
  function sendPending(endpoint) {
    var url = endpoint || "/api/memo";
    var entries = loadEntries();
    var pending = entries.filter(function (e) { return !e.synced; });
    return pending.reduce(function (chain, entry) {
      return chain.then(function (sent) {
        return fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(entry)
        })
          .then(function (res) {
            if (res.ok) { entry.synced = true; return sent + 1; }
            return sent;
          })
          .catch(function () { return sent; });
      });
    }, Promise.resolve(0)).then(function (sent) {
      saveEntries(entries);
      return sent;
    });
  }

  window.DeviceMemo = {
    record: record,
    sendPending: sendPending,
    getAll: loadEntries,
    remove: function (id) {
      saveEntries(loadEntries().filter(function (e) { return e.id !== id; }));
    },
    clear: function () {
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    },
    exportJson: function () {
      return JSON.stringify(loadEntries(), null, 2);
    }
  };
})();
