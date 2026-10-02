var api = (typeof browser !== "undefined") ? browser : chrome;

var els = {
  list: document.getElementById("list"),
  empty: document.getElementById("empty"),
  clear: document.getElementById("clear"),
  launcher: document.getElementById("launcher"),
  extension: document.getElementById("extension"),
  includeCookie: document.getElementById("includeCookie"),
};

var DEFAULTS = { launcher: "python", extension: "", includeCookie: true };
var state = { streams: [], activeTabId: -1, settings: Object.assign({}, DEFAULTS) };

function storageGet(area, defaults) {
  return new Promise(function (resolve) {
    api.storage[area].get(defaults, function (data) { resolve(data || {}); });
  });
}

function currentTabId() {
  return new Promise(function (resolve) {
    api.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      resolve(tabs && tabs[0] ? tabs[0].id : -1);
    });
  });
}

async function copyText(text, button) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    var ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  if (button) {
    var original = button.textContent;
    button.textContent = "Copiato!";
    button.disabled = true;
    setTimeout(function () { button.textContent = original; button.disabled = false; }, 1200);
  }
}

function timestamp() {
  var d = new Date();
  function p(n) { return String(n).padStart(2, "0"); }
  return "" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "_" +
         p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}

function commandFor(stream) {
  var ext = state.settings.extension;
  var filename = timestamp() + "_video" + (ext ? "." + ext : "");
  return VibraVidLib.buildCommand({
    url: stream.url,
    headers: stream.headers,
    launcher: state.settings.launcher,
    includeCookie: state.settings.includeCookie,
    extension: ext,
    filename: filename,
  });
}

function visibleStreams() {
  return state.streams.filter(function (s) { return s.tabId === state.activeTabId; });
}

function render() {
  var streams = visibleStreams();
  els.list.textContent = "";
  els.empty.classList.toggle("hidden", streams.length > 0);

  streams.forEach(function (stream) {
    var card = document.createElement("div");
    card.className = "stream";

    var row1 = document.createElement("div");
    row1.className = "row1";
    var chip = document.createElement("span");
    chip.className = "chip " + stream.type;
    chip.textContent = stream.type;
    var host = document.createElement("span");
    host.className = "host";
    host.textContent = VibraVidLib.hostnameOf(stream.url);
    row1.appendChild(chip);
    row1.appendChild(host);

    var url = document.createElement("div");
    url.className = "url";
    url.textContent = stream.url;
    url.title = stream.url;

    var code = document.createElement("code");
    code.className = "cmd";
    code.textContent = commandFor(stream);

    var actions = document.createElement("div");
    actions.className = "actions";
    var copyCmd = document.createElement("button");
    copyCmd.className = "primary";
    copyCmd.textContent = "Copia comando";
    copyCmd.addEventListener("click", function () {
      var cmd = commandFor(stream);
      code.textContent = cmd;
      copyText(cmd, copyCmd);
    });
    actions.appendChild(copyCmd);

    card.appendChild(row1);
    card.appendChild(url);
    card.appendChild(code);
    card.appendChild(actions);
    els.list.appendChild(card);
  });
}

function persistSettings() {
  api.storage.local.set({ settings: state.settings });
}

function bindSettings() {
  els.launcher.value = state.settings.launcher;
  els.extension.value = state.settings.extension;
  els.includeCookie.checked = state.settings.includeCookie;

  els.launcher.addEventListener("change", function () { state.settings.launcher = els.launcher.value; persistSettings(); render(); });
  els.extension.addEventListener("change", function () { state.settings.extension = els.extension.value; persistSettings(); render(); });
  els.includeCookie.addEventListener("change", function () { state.settings.includeCookie = els.includeCookie.checked; persistSettings(); render(); });

  els.clear.addEventListener("click", function () {
    var kept = state.streams.filter(function (s) { return s.tabId !== state.activeTabId; });
    api.storage.session.set({ streams: kept }, function () {
      state.streams = kept;
      try { api.action.setBadgeText({ tabId: state.activeTabId, text: "" }); } catch (e) {}
      render();
    });
  });
}

api.storage.onChanged.addListener(function (changes, area) {
  if (area === "session" && changes.streams) {
    state.streams = changes.streams.newValue || [];
    render();
  }
});

async function init() {
  var local = await storageGet("local", { settings: DEFAULTS });
  state.settings = Object.assign({}, DEFAULTS, local.settings || {});
  state.activeTabId = await currentTabId();
  var session = await storageGet("session", { streams: [] });
  state.streams = session.streams || [];
  bindSettings();
  render();
}

init();
