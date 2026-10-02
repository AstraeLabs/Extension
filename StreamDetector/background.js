if (typeof VibraVidLib === "undefined" && typeof importScripts === "function") {
  importScripts("lib.js");
}

var api = (typeof browser !== "undefined") ? browser : chrome;
var MAX_STREAMS = 200;
var BADGE_COLOR = "#7c3aed";
var pending = new Map();

function setBadge(tabId, count) {
  if (tabId === undefined || tabId < 0) return;
  try {
    api.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
    api.action.setBadgeText({ tabId: tabId, text: count ? String(count) : "" });
  } catch (e) {}
}

function getStreams() {
  return new Promise(function (resolve) {
    api.storage.session.get("streams", function (data) {
      resolve((data && data.streams) || []);
    });
  });
}

function setStreams(streams) {
  return new Promise(function (resolve) {
    api.storage.session.set({ streams: streams }, function () { resolve(); });
  });
}

function tabCount(streams, tabId) {
  return streams.filter(function (s) { return s.tabId === tabId; }).length;
}

function contentTypeOf(responseHeaders) {
  if (!Array.isArray(responseHeaders)) return "";
  for (var i = 0; i < responseHeaders.length; i++) {
    if (responseHeaders[i].name.toLowerCase() === "content-type") {
      return responseHeaders[i].value || "";
    }
  }
  return "";
}

async function addStream(entry) {
  var streams = await getStreams();
  if (streams.some(function (s) { return s.url === entry.url; })) {
    setBadge(entry.tabId, tabCount(streams, entry.tabId));
    return;
  }
  streams.unshift(entry);
  if (streams.length > MAX_STREAMS) streams.length = MAX_STREAMS;
  await setStreams(streams);
  setBadge(entry.tabId, tabCount(streams, entry.tabId));
}

function onSendHeaders(details) {
  if (!VibraVidLib.detectStreamType(details.url)) return;
  pending.set(details.requestId, {
    page: details.documentUrl || details.originUrl || details.initiator || "",
    headers: VibraVidLib.pickHeaders(details.requestHeaders),
  });
  if (pending.size > 600) pending.clear();
}

function onHeadersReceived(details) {
  var meta = pending.get(details.requestId);
  pending.delete(details.requestId);

  var ct = contentTypeOf(details.responseHeaders);
  var type = VibraVidLib.detectStreamType(details.url, ct);
  if (!type) return;

  addStream({
    url: details.url,
    type: type,
    tabId: details.tabId,
    page: (meta && meta.page) || details.documentUrl || details.initiator || "",
    headers: (meta && meta.headers) || {},
    time: Date.now(),
  });
}

function dropPending(details) {
  pending.delete(details.requestId);
}

async function onTopNavigation(details) {
  if (details.tabId === undefined || details.tabId < 0) return;
  var streams = await getStreams();
  var kept = streams.filter(function (s) { return s.tabId !== details.tabId; });
  if (kept.length !== streams.length) await setStreams(kept);
  setBadge(details.tabId, 0);
}

var filter = { urls: ["<all_urls>"] };

try {
  api.webRequest.onSendHeaders.addListener(onSendHeaders, filter, ["requestHeaders", "extraHeaders"]);
} catch (e) {
  api.webRequest.onSendHeaders.addListener(onSendHeaders, filter, ["requestHeaders"]);
}

try {
  api.webRequest.onHeadersReceived.addListener(onHeadersReceived, filter, ["responseHeaders", "extraHeaders"]);
} catch (e) {
  api.webRequest.onHeadersReceived.addListener(onHeadersReceived, filter, ["responseHeaders"]);
}

api.webRequest.onCompleted.addListener(dropPending, filter);
api.webRequest.onErrorOccurred.addListener(dropPending, filter);

api.webRequest.onBeforeRequest.addListener(onTopNavigation, {
  urls: ["<all_urls>"],
  types: ["main_frame"],
});
