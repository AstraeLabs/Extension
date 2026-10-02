(function (root) {
  "use strict";

  var MANIFEST_RULES = [
    { type: "dash", re: /\.(mpd|mpp)$/ },
    { type: "ism",  re: /\.ism(\/manifest)?$/ },
    { type: "hls",  re: /\.(m3u8|m3u)$/ },
  ];

  var CONTENT_TYPE_RULES = [
    { type: "hls",  re: /mpegurl/ },
    { type: "dash", re: /dash\+xml/ },
    { type: "ism",  re: /sstr|smoothstream|ms-sstr/ },
  ];

  var PROGRESSIVE_RE = /\.(mp4|m4v|mkv|mov|webm|avi)$/;
  var SEGMENT_EXT_RE = /\.(ts|m4s|m4a|aac|cmf[vat]|dash)$/;
  var SEGMENT_TOKEN_RE = /(?:^|[-_/.])(seg|segment|chunk|frag|fragment|init|media)(?:[-_0-9.]|$)/;
  var SEGMENT_COUNTER_RE = /(?:[-_.]0\d+|[-_]\d{2,})\.(?:mp4|m4v|mkv|mov|webm|avi)$/;

  var WANTED_HEADERS = ["referer", "user-agent", "origin", "cookie"];

  var LAUNCHERS = {
    python: "python manual.py",
    exe: "VibraVid.exe",
    bare: "VibraVid",
  };

  function cleanUrl(url) {
    return url.toLowerCase().split("?")[0].split("#")[0].replace(/\/+$/, "");
  }

  function looksLikeSegment(clean) {
    var name = clean.split("/").pop() || clean;
    if (SEGMENT_EXT_RE.test(name)) return true;
    if (SEGMENT_TOKEN_RE.test(name)) return true;
    if (SEGMENT_COUNTER_RE.test(name)) return true;
    return false;
  }

  function detectStreamType(url, contentType) {
    if (typeof url !== "string" || !url) return null;
    var clean = cleanUrl(url);

    if (SEGMENT_EXT_RE.test(clean.split("/").pop() || clean)) return null;

    for (var i = 0; i < MANIFEST_RULES.length; i++) {
      if (MANIFEST_RULES[i].re.test(clean)) return MANIFEST_RULES[i].type;
    }

    var ct = (contentType || "").toLowerCase();
    if (ct) {
      for (var j = 0; j < CONTENT_TYPE_RULES.length; j++) {
        if (CONTENT_TYPE_RULES[j].re.test(ct)) return CONTENT_TYPE_RULES[j].type;
      }
    }

    if (PROGRESSIVE_RE.test(clean) && !looksLikeSegment(clean)) {
      if (ct && !/^video\/|^application\/octet-stream|^binary\//.test(ct)) return null;
      return "mp4";
    }

    return null;
  }

  function pickHeaders(requestHeaders) {
    var out = {};
    if (!Array.isArray(requestHeaders)) return out;
    for (var i = 0; i < requestHeaders.length; i++) {
      var h = requestHeaders[i];
      if (!h || typeof h.name !== "string") continue;
      if (WANTED_HEADERS.indexOf(h.name.toLowerCase()) !== -1 && h.value) {
        out[h.name] = h.value;
      }
    }
    return out;
  }

  function quote(value) {
    return '"' + String(value).replace(/"/g, "'") + '"';
  }

  function buildCommand(opts) {
    opts = opts || {};
    var prefix = LAUNCHERS[opts.launcher] || LAUNCHERS.python;
    var includeCookie = opts.includeCookie !== false;
    var parts = [prefix, "--down", quote(opts.url)];

    var headers = opts.headers || {};
    Object.keys(headers).forEach(function (name) {
      if (!includeCookie && name.toLowerCase() === "cookie") return;
      var value = headers[name];
      if (value === undefined || value === null || value === "") return;
      parts.push("--headers", quote(name + ":" + value));
    });

    if (opts.extension) parts.push("--extension", opts.extension);
    if (opts.filename) parts.push("-o", quote(opts.filename));

    return parts.join(" ");
  }

  function hostnameOf(url) {
    try {
      return new URL(url).hostname;
    } catch (e) {
      return "";
    }
  }

  var VibraVidLib = {
    LAUNCHERS: LAUNCHERS,
    detectStreamType: detectStreamType,
    looksLikeSegment: looksLikeSegment,
    pickHeaders: pickHeaders,
    quote: quote,
    buildCommand: buildCommand,
    hostnameOf: hostnameOf,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = VibraVidLib;
  } else {
    root.VibraVidLib = VibraVidLib;
  }
})(typeof self !== "undefined" ? self : this);
