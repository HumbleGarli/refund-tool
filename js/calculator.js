/* Refund Tool — static export logic (no dependencies).
   Date/input behaviour is preserved; refund policy v2 is isolated in pure helpers below. */
(function () {
  "use strict";

  var TZ = "Asia/Ho_Chi_Minh";
  var DAY = 86400000;
  var REFUND_POLICY = Object.freeze({
    REPLACEMENT_DAYS: 7,
    BASE_REFUND_RATE: 0.80,
    DECAY_POWER: 0.5,
  });

  /* ---------- date / money helpers ---------- */

  function todayVN() {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  }

  function parseDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return null;
    var parts = value.split("-").map(Number);
    var y = parts[0], m = parts[1], d = parts[2];
    var ts = Date.UTC(y, m - 1, d);
    var back = new Date(ts);
    if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) {
      return null;
    }
    return ts;
  }

  function diffDays(a, b) { return Math.round((b - a) / DAY); }

  function addDuration(value, amount, unit) {
    var ts = parseDate(value);
    if (ts === null || !isFinite(amount)) return "";
    var d = new Date(ts);
    if (unit === "day") {
      // inclusive package: N days total => expiry = purchase + N - 1
      d.setUTCDate(d.getUTCDate() + amount - 1);
    } else if (unit === "month") {
      // legacy source behaviour: plain calendar arithmetic, no minus-one-day
      d.setUTCMonth(d.getUTCMonth() + amount);
    } else {
      d.setUTCFullYear(d.getUTCFullYear() + amount);
    }
    return d.toISOString().slice(0, 10);
  }

  function formatVND(n) {
    return new Intl.NumberFormat("vi-VN").format(Math.round(n));
  }

  function formatPercent(n) {
    return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(n) + "%";
  }

  function formatDateVN(value) {
    var ts = parseDate(value);
    if (ts === null) return "—";
    var d = new Date(ts);
    return (
      String(d.getUTCDate()).padStart(2, "0") + "/" +
      String(d.getUTCMonth() + 1).padStart(2, "0") + "/" +
      d.getUTCFullYear()
    );
  }

  function parsePrice(raw) {
    var digits = String(raw || "").replace(/[^\d]/g, "");
    return digits ? Number(digits) : 0;
  }

  /* ---------- validation + calculation ---------- */

  function roundMoney(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  function calculateRefundBreakdown(paidPrice, totalDays, usedDays) {
    var P = Number(paidPrice);
    var T = Number(totalDays);
    var rawD = Number(usedDays);

    if (
      !Number.isFinite(P) ||
      !Number.isFinite(T) ||
      !Number.isFinite(rawD) ||
      P < 0 ||
      T <= 0
    ) {
      throw new Error("Invalid refund input");
    }

    var D = Math.max(0, Math.min(rawD, T));
    var remainingDays = T - D;
    var remainingRatio = remainingDays / T;
    var remainingValue = P * remainingRatio;
    var usedValue = P - remainingValue;
    var refund = 0;
    var policyKey = "expired";
    var baseRefundRate = 0;
    var decayRatio = 0;
    var decayFactor = 0;

    if (D < T) {
      if (D <= REFUND_POLICY.REPLACEMENT_DAYS || T <= REFUND_POLICY.REPLACEMENT_DAYS) {
        refund = remainingValue;
        policyKey = "replacement-window";
        baseRefundRate = 1;
        decayRatio = 1;
        decayFactor = 1;
      } else {
        decayRatio = remainingDays / (T - REFUND_POLICY.REPLACEMENT_DAYS);
        decayFactor = Math.pow(decayRatio, REFUND_POLICY.DECAY_POWER);
        baseRefundRate = REFUND_POLICY.BASE_REFUND_RATE;
        refund = remainingValue * baseRefundRate * decayFactor;
        policyKey = "depreciated";
      }
    }

    var finalRefund = Math.max(0, Math.min(P, roundMoney(refund)));
    var effectiveRefundPercent = P > 0 ? (finalRefund / P) * 100 : 0;

    return {
      paidPrice: P,
      totalDays: T,
      usedDays: D,
      remainingDays: remainingDays,
      remainingRatio: remainingRatio,
      usedValue: usedValue,
      remainingValue: remainingValue,
      baseRefundRate: baseRefundRate,
      decayRatio: decayRatio,
      decayFactor: decayFactor,
      policyKey: policyKey,
      refund: finalRefund,
      effectiveRefundPercent: effectiveRefundPercent,
    };
  }

  function calculateRefund(paidPrice, totalDays, usedDays) {
    return calculateRefundBreakdown(paidPrice, totalDays, usedDays).refund;
  }

  function validate(input) {
    var errors = {};
    var p = parseDate(input.purchaseDate);
    var e = parseDate(input.expiryDate);
    var s = parseDate(input.stopDate);

    if (p === null) errors.purchase = "Vui lòng chọn ngày mua.";
    if (e === null) errors.expiry = "Vui lòng chọn ngày hết hạn.";
    if (s === null) errors.stop = "Vui lòng chọn ngày ngừng sử dụng.";
    if (!(input.price > 0)) errors.price = "Giá gói phải lớn hơn 0.";

    if (p !== null && e !== null && e < p) {
      errors.expiry = "Ngày hết hạn phải từ ngày mua trở đi.";
    }
    if (p !== null && s !== null && s < p) {
      errors.stop = "Ngày ngừng không thể trước ngày mua.";
    }
    if (e !== null && s !== null && s > e && !errors.stop) {
      errors.stop = "Ngày ngừng không thể sau ngày hết hạn.";
    }
    return errors;
  }

  function calculate(input) {
    if (Object.keys(validate(input)).length > 0) return null;
    var p = parseDate(input.purchaseDate);
    var e = parseDate(input.expiryDate);
    var s = parseDate(input.stopDate);

    var totalDays = diffDays(p, e) + 1;
    var usedDays = diffDays(p, s) + 1;
    var breakdown = calculateRefundBreakdown(input.price, totalDays, usedDays);

    return {
      totalDays: totalDays,
      usedDays: breakdown.usedDays,
      remainingDays: breakdown.remainingDays,
      usedFee: breakdown.usedValue,
      remainingValue: breakdown.remainingValue,
      refund: breakdown.refund,
      usedRatio: breakdown.usedDays / totalDays,
      effectiveRefundPercent: breakdown.effectiveRefundPercent,
      policyKey: breakdown.policyKey,
      baseRefundRate: breakdown.baseRefundRate,
      decayFactor: breakdown.decayFactor,
    };
  }

  /* ---------- clipboard (two-tier) ---------- */

  function legacyCopy(text) {
    if (typeof document === "undefined") return false;
    var active = document.activeElement;
    var textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.setAttribute("aria-hidden", "true");
    var s = textarea.style;
    s.position = "fixed"; s.top = "0"; s.left = "0";
    s.width = "1px"; s.height = "1px"; s.padding = "0";
    s.border = "none"; s.outline = "none"; s.boxShadow = "none";
    s.background = "transparent"; s.opacity = "0"; s.pointerEvents = "none";

    document.body.appendChild(textarea);
    var ok = false;
    try {
      textarea.focus({ preventScroll: true });
      textarea.select();
      textarea.setSelectionRange(0, text.length);
      ok = document.execCommand("copy");
    } catch (err) {
      ok = false;
    } finally {
      document.body.removeChild(textarea);
      if (active && typeof active.focus === "function") {
        try { active.focus({ preventScroll: true }); } catch (e2) { /* ignore */ }
      }
    }
    return ok;
  }

  function copyText(text) {
    if (!text) return Promise.resolve(false);
    if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard
        .writeText(text)
        .then(function () { return true; })
        .catch(function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }

  /* ---------- DOM wiring ---------- */

  var $ = function (id) { return document.getElementById(id); };

  function ensureBreakdownRows() {
    var summary = document.querySelector(".summary");
    if (!summary || $("s-effective")) return;
    summary.innerHTML =
      '<div class="srow"><span>Giá khách đã trả</span><b class="tabular" id="s-price">0 ₫</b></div>' +
      '<div class="srow"><span>Tổng thời hạn</span><b class="tabular" id="s-total">—</b></div>' +
      '<div class="srow"><span>Đã sử dụng</span><b class="tabular" id="s-used-days">—</b></div>' +
      '<div class="srow"><span>Giá trị thời gian đã dùng</span><b class="tabular is-warning" id="s-used">—</b></div>' +
      '<div class="srow"><span>Số ngày còn lại</span><b class="tabular" id="s-remaining-days">—</b></div>' +
      '<div class="srow"><span>Giá trị thời gian còn lại</span><b class="tabular" id="s-remaining-value">—</b></div>' +
      '<div class="srow"><span>Chính sách</span><b id="s-policy">—</b></div>' +
      '<div class="srow"><span>Tỷ lệ Refund thực tế</span><b class="tabular" id="s-effective">—</b></div>' +
      '<div class="sdiv"></div>' +
      '<div class="srow"><span>Số tiền Refund</span><b class="tabular is-success" id="s-refund">—</b></div>';
  }

  ensureBreakdownRows();

  var el = {
    price: $("price"),
    purchase: $("purchase"),
    stop: $("stop"),
    expiry: $("expiry"),
    purchaseToday: $("purchase-today"),
    stopToday: $("stop-today"),
    presets: $("presets"),
    customAmount: $("custom-amount"),
    units: $("units"),
    applyCustom: $("apply-custom"),
    footNote: $("foot-note"),
    priceMsg: $("price-msg"),
    purchaseMsg: $("purchase-msg"),
    stopMsg: $("stop-msg"),
    expiryMsg: $("expiry-msg"),
    amount: $("refund-amount"),
    pct: $("refund-pct"),
    resultSub: $("result-sub"),
    usedVal: $("used-val"),
    leftVal: $("left-val"),
    track: $("track"),
    trackFill: $("track-fill"),
    trackKnob: $("track-knob"),
    tlStart: $("tl-start"),
    tlStop: $("tl-stop"),
    tlEnd: $("tl-end"),
    sPrice: $("s-price"),
    sUsed: $("s-used"),
    sTotal: $("s-total"),
    sUsedDays: $("s-used-days"),
    sRemainingDays: $("s-remaining-days"),
    sRemainingValue: $("s-remaining-value"),
    sPolicy: $("s-policy"),
    sEffective: $("s-effective"),
    sRefund: $("s-refund"),
    copyAmount: $("copy-amount"),
    copySummary: $("copy-summary"),
    copySummaryText: $("copy-summary-text"),
    reset: $("reset"),
    stickyAmount: $("sticky-amount"),
    stickyCopy: $("sticky-copy"),
    toasts: $("toasts"),
  };

  var state = {
    priceRaw: "",
    customUnit: "day",
    activePreset: null,
    touched: {},
  };
  var timers = [];
  var DEFAULT_NOTE =
    "Kết quả được tính tự động; ngày mua và ngày ngừng đều được tính là ngày sử dụng.";
  var PRICE_HINT = "Tổng số tiền khách đã thanh toán cho chính đơn hàng này.";

  function policyLabel(result) {
    if (!result) return "—";
    if (result.policyKey === "expired") return "Hết thời hạn";
    if (result.policyKey === "replacement-window") return "Đổi mới 1:1 · không khấu hao";
    return "80% cơ sở + khấu hao";
  }

  function policyDescription(result) {
    if (!result) return "";
    if (result.policyKey === "expired") {
      return "Gói đã hết thời hạn · Refund = 0";
    }
    if (result.policyKey === "replacement-window") {
      return "Trong thời gian đổi mới 1:1 · Không áp dụng khấu hao — chỉ trừ thời gian đã sử dụng";
    }
    return "Sau 7 ngày · Refund cơ sở 80% + khấu hao theo thời gian";
  }

  function toast(message, opts) {
    opts = opts || {};
    var node = document.createElement("div");
    node.className = "toast" + (opts.type ? " is-" + opts.type : "");
    var main = document.createElement("div");
    main.textContent = message;
    node.appendChild(main);
    if (opts.description) {
      var d = document.createElement("p");
      d.className = "desc";
      d.textContent = opts.description;
      node.appendChild(d);
    }
    el.toasts.appendChild(node);
    window.setTimeout(function () {
      if (node.parentNode) node.parentNode.removeChild(node);
    }, 2600);
  }

  function setIconState(button, copied) {
    var copyIco = button.querySelector(".ico-copy");
    var checkIco = button.querySelector(".ico-check");
    if (copyIco) copyIco.hidden = copied;
    if (checkIco) checkIco.hidden = !copied;
  }

  function flashCopied(button, textNode, copiedLabel, normalLabel) {
    setIconState(button, true);
    if (textNode) textNode.textContent = copiedLabel;
    var id = window.setTimeout(function () {
      setIconState(button, false);
      if (textNode) textNode.textContent = normalLabel;
    }, 1800);
    timers.push(id);
  }

  function doCopy(text, onDone, label) {
    copyText(text).then(function (ok) {
      if (ok) {
        if (onDone) onDone();
        toast(label, { type: "success" });
      } else {
        toast("Không sao chép được", {
          type: "error",
          description: "Trình duyệt đã chặn quyền truy cập clipboard.",
        });
      }
    });
  }

  function currentInput() {
    return {
      purchaseDate: el.purchase.value,
      expiryDate: el.expiry.value,
      stopDate: el.stop.value,
      price: parsePrice(state.priceRaw),
    };
  }

  function summaryText(result, input) {
    if (!result) return "";
    var lines = [
      "TÍNH TIỀN HOÀN GÓI DỊCH VỤ",
      "• Giá khách đã trả: " + formatVND(input.price) + " ₫",
      "• Ngày mua: " + formatDateVN(input.purchaseDate),
      "• Ngày hết hạn: " + formatDateVN(input.expiryDate),
      "• Ngày ngừng sử dụng: " + formatDateVN(input.stopDate),
      "• Tổng thời hạn: " + result.totalDays + " ngày",
      "• Đã sử dụng: " + result.usedDays + " ngày (" + formatVND(result.usedFee) + " ₫)",
      "• Còn lại: " + result.remainingDays + " ngày",
      "• Giá trị thời gian còn lại: " + formatVND(result.remainingValue) + " ₫",
      "• Chính sách: " + policyLabel(result),
    ];
    if (result.policyKey === "depreciated") {
      lines.push("• Refund cơ sở: " + formatPercent(REFUND_POLICY.BASE_REFUND_RATE * 100));
    }
    lines.push("• Tỷ lệ Refund thực tế: " + formatPercent(result.effectiveRefundPercent));
    lines.push("➜ SỐ TIỀN HOÀN: " + formatVND(result.refund) + " ₫");
    return lines.join("\n");
  }

  function showFieldError(msgEl, inputEl, message) {
    if (message) {
      msgEl.textContent = message;
      msgEl.hidden = false;
      if (inputEl) inputEl.setAttribute("aria-invalid", "true");
    } else {
      msgEl.hidden = true;
      msgEl.textContent = "";
      if (inputEl) inputEl.removeAttribute("aria-invalid");
    }
  }

  function syncConstraint(inputEl, name, value) {
    if (value) {
      if (inputEl.getAttribute(name) !== value) inputEl.setAttribute(name, value);
    } else if (inputEl.hasAttribute(name)) {
      inputEl.removeAttribute(name);
    }
  }

  var latest = { result: null, input: null };

  function render() {
    var input = currentInput();
    var errors = validate(input);
    var result = calculate(input);
    latest.result = result;
    latest.input = input;

    var priceErr = state.touched.price ? errors.price : null;
    if (priceErr) {
      el.priceMsg.textContent = priceErr;
      el.priceMsg.className = "error";
      el.price.setAttribute("aria-invalid", "true");
    } else {
      el.priceMsg.textContent = PRICE_HINT;
      el.priceMsg.className = "hint";
      el.price.removeAttribute("aria-invalid");
    }
    showFieldError(el.purchaseMsg, el.purchase, state.touched.purchase ? errors.purchase : null);
    showFieldError(el.stopMsg, el.stop, state.touched.stop ? errors.stop : null);
    showFieldError(el.expiryMsg, el.expiry, state.touched.expiry ? errors.expiry : null);

    var anyTouched = Object.keys(state.touched).length > 0;
    if (anyTouched && Object.keys(errors).length > 0) {
      el.footNote.textContent = "Vui lòng kiểm tra lại các trường được đánh dấu bên trên.";
      el.footNote.className = "foot-note is-error";
      el.footNote.setAttribute("role", "alert");
    } else {
      el.footNote.textContent = DEFAULT_NOTE;
      el.footNote.className = "foot-note";
      el.footNote.removeAttribute("role");
    }

    // Avoid rewriting native date constraints unless the value actually changed.
    // Chromium can reset an in-progress dd/mm/yyyy segment editor when min/max
    // attributes are mutated while the user is typing the date.
    syncConstraint(el.stop, "min", el.purchase.value);
    syncConstraint(el.expiry, "min", el.purchase.value);
    syncConstraint(el.stop, "max", el.expiry.value);

    var usedPct = result ? Math.min(100, Math.max(0, result.usedRatio * 100)) : 0;
    var remainingPct = result ? Math.max(0, 100 - usedPct) : 0;

    if (result) {
      el.amount.innerHTML = "";
      el.amount.appendChild(document.createTextNode(formatVND(result.refund)));
      var cur = document.createElement("span");
      cur.className = "cur";
      cur.textContent = "₫";
      el.amount.appendChild(cur);
      el.amount.classList.remove("is-empty");
      el.pct.hidden = false;
      el.pct.textContent = formatPercent(result.effectiveRefundPercent) + " giá gói";
      el.resultSub.textContent = policyDescription(result);
      el.usedVal.innerHTML = "";
      el.usedVal.appendChild(document.createTextNode(result.usedDays + " ngày"));
      var sub1 = document.createElement("span");
      sub1.className = "sub";
      sub1.textContent = "· " + Math.round(usedPct) + "%";
      el.usedVal.appendChild(sub1);
      el.leftVal.innerHTML = "";
      el.leftVal.appendChild(document.createTextNode(result.remainingDays + " ngày"));
      var sub2 = document.createElement("span");
      sub2.className = "sub";
      sub2.textContent = "· " + Math.round(remainingPct) + "%";
      el.leftVal.appendChild(sub2);
      el.track.setAttribute(
        "aria-label",
        "Đã dùng " + Math.round(usedPct) + " phần trăm thời hạn gói",
      );
      el.trackKnob.hidden = false;
      el.trackKnob.style.left = usedPct + "%";
      el.sUsed.textContent = formatVND(result.usedFee) + " ₫";
      el.sTotal.textContent = result.totalDays + " ngày";
      el.sUsedDays.textContent = result.usedDays + " ngày";
      el.sRemainingDays.textContent = result.remainingDays + " ngày";
      el.sRemainingValue.textContent = formatVND(result.remainingValue) + " ₫";
      el.sPolicy.textContent = policyLabel(result);
      el.sEffective.textContent = formatPercent(result.effectiveRefundPercent);
      el.sRefund.textContent = formatVND(result.refund) + " ₫";
      el.stickyAmount.textContent = formatVND(result.refund) + " ₫";
      el.stickyAmount.classList.remove("is-empty");
    } else {
      el.amount.textContent = "—";
      el.amount.classList.add("is-empty");
      el.pct.hidden = true;
      el.resultSub.textContent = "Nhập đủ thông tin để xem số tiền hoàn.";
      el.usedVal.textContent = "—";
      el.leftVal.textContent = "—";
      el.track.setAttribute("aria-label", "Chưa có dữ liệu");
      el.trackKnob.hidden = true;
      el.sUsed.textContent = "—";
      el.sTotal.textContent = "—";
      el.sUsedDays.textContent = "—";
      el.sRemainingDays.textContent = "—";
      el.sRemainingValue.textContent = "—";
      el.sPolicy.textContent = "—";
      el.sEffective.textContent = "—";
      el.sRefund.textContent = "—";
      el.stickyAmount.textContent = "—";
      el.stickyAmount.classList.add("is-empty");
    }

    el.trackFill.style.width = usedPct + "%";
    el.tlStart.textContent = formatDateVN(input.purchaseDate);
    el.tlStop.textContent = "Ngừng: " + formatDateVN(input.stopDate);
    el.tlEnd.textContent = formatDateVN(input.expiryDate);
    el.sPrice.textContent = formatVND(input.price) + " ₫";

    el.copyAmount.disabled = !result;
    el.copySummary.disabled = !result;
    el.stickyCopy.disabled = !result;

    var n = Number(el.customAmount.value);
    el.applyCustom.disabled = !el.customAmount.value || !(n > 0);
  }

  function setActivePreset(key) {
    state.activePreset = key;
    var chips = el.presets.querySelectorAll(".chip");
    for (var i = 0; i < chips.length; i++) {
      chips[i].setAttribute("aria-pressed", chips[i].dataset.days === key ? "true" : "false");
    }
  }

  function applyDuration(amount, unit, key) {
    if (!el.purchase.value) {
      toast("Hãy chọn ngày mua trước", {
        type: "error",
        description: "Thời hạn gói được tính từ ngày mua.",
      });
      return;
    }
    var next = addDuration(el.purchase.value, amount, unit);
    if (next) {
      el.expiry.value = next;
      setActivePreset(key);
      state.touched.expiry = true;
      render();
    }
  }

  el.price.addEventListener("input", function () {
    state.priceRaw = el.price.value;
    var n = parsePrice(state.priceRaw);
    el.price.value = state.priceRaw ? (n ? formatVND(n) : "") : "";
    render();
  });
  el.price.addEventListener("blur", function () { state.touched.price = true; render(); });

  // Native date controls (especially Chromium on Windows) emit `input` while
  // the user is still composing day/month/year segments. Rendering at that
  // point mutates constraints/validation and can reset the segment editor.
  // `change` fires once a complete date is committed; `blur` handles errors.
  el.purchase.addEventListener("change", function () { setActivePreset(null); render(); });
  el.purchase.addEventListener("blur", function () { state.touched.purchase = true; render(); });

  el.expiry.addEventListener("change", function () { setActivePreset(null); render(); });
  el.expiry.addEventListener("blur", function () { state.touched.expiry = true; render(); });

  el.stop.addEventListener("change", render);
  el.stop.addEventListener("blur", function () { state.touched.stop = true; render(); });

  el.purchaseToday.addEventListener("click", function () {
    el.purchase.value = todayVN();
    state.touched.purchase = true;
    setActivePreset(null);
    render();
  });
  el.stopToday.addEventListener("click", function () {
    el.stop.value = todayVN();
    state.touched.stop = true;
    render();
  });

  el.presets.addEventListener("click", function (e) {
    var btn = e.target.closest(".chip");
    if (!btn) return;
    applyDuration(Number(btn.dataset.days), "day", btn.dataset.days);
  });

  el.units.addEventListener("click", function (e) {
    var btn = e.target.closest(".seg");
    if (!btn) return;
    state.customUnit = btn.dataset.unit;
    var segs = el.units.querySelectorAll(".seg");
    for (var i = 0; i < segs.length; i++) {
      var on = segs[i] === btn;
      segs[i].classList.toggle("is-active", on);
      segs[i].setAttribute("aria-pressed", on ? "true" : "false");
    }
  });

  el.customAmount.addEventListener("input", function () {
    el.customAmount.value = el.customAmount.value.replace(/[^\d]/g, "");
    render();
  });

  el.applyCustom.addEventListener("click", function () {
    applyDuration(Number(el.customAmount.value), state.customUnit, "custom");
  });

  el.copyAmount.addEventListener("click", function () {
    if (!latest.result) return;
    doCopy(
      formatVND(latest.result.refund),
      function () { flashCopied(el.copyAmount); },
      "Đã sao chép số tiền hoàn",
    );
  });

  el.stickyCopy.addEventListener("click", function () {
    if (!latest.result) return;
    doCopy(
      formatVND(latest.result.refund),
      function () { flashCopied(el.stickyCopy); },
      "Đã sao chép số tiền hoàn",
    );
  });

  el.copySummary.addEventListener("click", function () {
    if (!latest.result) return;
    doCopy(
      summaryText(latest.result, latest.input),
      function () {
        flashCopied(el.copySummary, el.copySummaryText, "Đã sao chép tóm tắt", "Sao chép tóm tắt");
      },
      "Đã sao chép tóm tắt",
    );
  });

  el.reset.addEventListener("click", function () {
    state.priceRaw = "";
    state.touched = {};
    state.customUnit = "day";
    el.price.value = "";
    el.purchase.value = "";
    el.expiry.value = "";
    el.stop.value = "";
    el.customAmount.value = "";
    setActivePreset(null);
    var segs = el.units.querySelectorAll(".seg");
    for (var i = 0; i < segs.length; i++) {
      var on = segs[i].dataset.unit === "day";
      segs[i].classList.toggle("is-active", on);
      segs[i].setAttribute("aria-pressed", on ? "true" : "false");
    }
    render();
    toast("Đã xoá toàn bộ dữ liệu");
  });

  render();

  window.RefundTool = {
    todayVN: todayVN,
    addDuration: addDuration,
    calculate: calculate,
    validate: validate,
    formatVND: formatVND,
    copyText: copyText,
    refundPolicy: REFUND_POLICY,
    calculateRefund: calculateRefund,
    calculateRefundBreakdown: calculateRefundBreakdown,
  };
})();
