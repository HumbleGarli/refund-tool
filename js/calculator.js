const TIMEZONE = 'Asia/Ho_Chi_Minh';

const form = document.getElementById('refund-form');
const errorEl = document.getElementById('error-message');
const resultEmpty = document.getElementById('result-empty');
const resultContent = document.getElementById('result-content');

const fields = {
  purchaseDate: document.getElementById('purchase-date'),
  expiryDate: document.getElementById('expiry-date'),
  stopDate: document.getElementById('stop-date'),
  totalPrice: document.getElementById('total-price'),
};

const hints = {
  purchase: document.getElementById('hint-purchase'),
  expiry: document.getElementById('hint-expiry'),
  stop: document.getElementById('hint-stop'),
};

const results = {
  calculatedAt: document.getElementById('calculated-at'),
  totalDays: document.getElementById('total-days'),
  usedDays: document.getElementById('used-days'),
  remainingDays: document.getElementById('remaining-days'),
  usedFee: document.getElementById('used-fee'),
  refundAmount: document.getElementById('refund-amount'),
  refundPct: document.getElementById('refund-pct'),
  tlStart: document.getElementById('tl-start'),
  tlStop: document.getElementById('tl-stop'),
  tlEnd: document.getElementById('tl-end'),
  timelineUsed: document.getElementById('timeline-used'),
  timelineMarker: document.getElementById('timeline-marker'),
  legendUsed: document.getElementById('legend-used'),
  legendRemain: document.getElementById('legend-remain'),
};

// New summary table elements
const summary = {
  purchase: document.getElementById('sum-purchase'),
  stop: document.getElementById('sum-stop'),
  expiry: document.getElementById('sum-expiry'),
  originalPrice: document.getElementById('sum-original-price'),
  totalDays: document.getElementById('sum-total-days'),
  usedDays: document.getElementById('sum-used-days'),
  remainingDays: document.getElementById('sum-remaining-days'),
  usedPct: document.getElementById('sum-used-pct'),
  usedFee: document.getElementById('sum-used-fee'),
  refundAmount: document.getElementById('sum-refund-amount'),
  refundPct: document.getElementById('sum-refund-pct'),
};

let lastRefundRaw = 0;
let lastSummaryData = null; // store for copy function

function parseDateString(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return { year, month, day };
}

function toDayNumber({ year, month, day }) {
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function daysBetweenInclusive(startStr, endStr) {
  return toDayNumber(parseDateString(endStr)) - toDayNumber(parseDateString(startStr)) + 1;
}

function formatVND(amount) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(Math.round(amount));
}

function formatVNDate(dateStr) {
  const { year, month, day } = parseDateString(dateStr);
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

function toInputDate(dayNum) {
  const d = new Date(dayNum * 86400000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getTodayVN() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const map = Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function getNowVN() {
  return new Date().toLocaleString('vi-VN', {
    timeZone: TIMEZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function parsePriceInput(value) {
  const cleaned = value.replace(/[^\d]/g, '');
  if (!cleaned) return NaN;
  return Number(cleaned);
}

function formatPriceInput(value) {
  const num = parsePriceInput(value);
  if (isNaN(num) || num === 0) return value.replace(/[^\d]/g, '');
  return new Intl.NumberFormat('vi-VN').format(num);
}

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function clearError() {
  errorEl.hidden = true;
  errorEl.textContent = '';
}

function validate(purchase, expiry, stop, price) {
  if (!purchase || !expiry || !stop) {
    return 'Vui lòng nhập đầy đủ các ngày.';
  }

  if (isNaN(price) || price <= 0) {
    return 'Tổng giá trị gói phải lớn hơn 0.';
  }

  const purchaseDay = toDayNumber(parseDateString(purchase));
  const expiryDay = toDayNumber(parseDateString(expiry));
  const stopDay = toDayNumber(parseDateString(stop));

  if (purchaseDay > stopDay) {
    return 'Ngày dừng sử dụng phải sau hoặc bằng ngày mua.';
  }

  if (stopDay > expiryDay) {
    return 'Ngày dừng sử dụng không được sau ngày hết hạn gói.';
  }

  if (purchaseDay > expiryDay) {
    return 'Ngày hết hạn gói phải sau hoặc bằng ngày mua.';
  }

  return null;
}

function calculateRefund(purchase, expiry, stop, price) {
  const totalDays = daysBetweenInclusive(purchase, expiry);
  const usedDays = daysBetweenInclusive(purchase, stop);
  const remainingDays = totalDays - usedDays;
  const usedFee = (usedDays / totalDays) * price;
  const refundAmount = price - usedFee;

  return { totalDays, usedDays, remainingDays, usedFee, refundAmount };
}

function updateHints(purchase, expiry, stop) {
  hints.purchase.textContent = purchase ? formatVNDate(purchase) : '';
  hints.purchase.classList.toggle('active', !!purchase);

  if (purchase && expiry) {
    const days = daysBetweenInclusive(purchase, expiry);
    hints.expiry.textContent = `Gói ${days} ngày`;
    hints.expiry.classList.add('active');
  } else {
    hints.expiry.textContent = expiry ? formatVNDate(expiry) : '';
    hints.expiry.classList.toggle('active', !!expiry);
  }

  if (purchase && stop) {
    const used = daysBetweenInclusive(purchase, stop);
    hints.stop.textContent = `Đã dùng ${used} ngày`;
    hints.stop.classList.add('active');
  } else {
    hints.stop.textContent = stop ? formatVNDate(stop) : '';
    hints.stop.classList.toggle('active', !!stop);
  }
}

function updateTimeline(data, purchase, expiry, stop) {
  const pct = data.totalDays > 0 ? (data.usedDays / data.totalDays) * 100 : 0;

  results.tlStart.textContent = formatVNDate(purchase);
  results.tlStop.textContent = formatVNDate(stop);
  results.tlEnd.textContent = formatVNDate(expiry);
  results.timelineUsed.style.width = `${pct}%`;
  results.timelineMarker.style.left = `${Math.min(pct, 100)}%`;
  results.legendUsed.textContent = data.usedDays;
  results.legendRemain.textContent = data.remainingDays;
}

function showResults(data, purchase, expiry, stop) {
  lastRefundRaw = data.refundAmount;

  results.calculatedAt.textContent = `Cập nhật: ${getNowVN()}`;
  results.totalDays.textContent = `${data.totalDays} ngày`;
  results.usedDays.textContent = `${data.usedDays} ngày`;
  results.remainingDays.textContent = `${data.remainingDays} ngày`;
  results.usedFee.textContent = formatVND(data.usedFee);
  results.refundAmount.textContent = formatVND(data.refundAmount);

  const refundPct = data.totalDays > 0 ? ((data.remainingDays / data.totalDays) * 100).toFixed(1) : 0;
  results.refundPct.textContent = `Hoàn ${refundPct}% giá trị gói còn lại`;

  updateTimeline(data, purchase, expiry, stop);

  // Populate summary table (for customer copy)
  const usedPct = data.totalDays > 0 ? ((data.usedDays / data.totalDays) * 100).toFixed(1) : 0;
  const originalPrice = data.usedFee + data.refundAmount;
  const nowStr = getNowVN();

  summary.purchase.textContent = formatVNDate(purchase);
  summary.stop.textContent = formatVNDate(stop);
  summary.expiry.textContent = formatVNDate(expiry);
  summary.originalPrice.textContent = formatVND(originalPrice);
  summary.totalDays.textContent = `${data.totalDays} ngày`;
  summary.usedDays.textContent = `${data.usedDays} ngày`;
  summary.remainingDays.textContent = `${data.remainingDays} ngày`;
  summary.usedPct.textContent = `${usedPct}%`;
  summary.usedFee.textContent = formatVND(data.usedFee);
  summary.refundAmount.textContent = formatVND(data.refundAmount);
  summary.refundPct.textContent = `${refundPct}%`;

  // Save data for copy
  lastSummaryData = {
    purchase, stop, expiry,
    totalDays: data.totalDays,
    usedDays: data.usedDays,
    remainingDays: data.remainingDays,
    usedPct, refundPct,
    usedFee: data.usedFee,
    refundAmount: data.refundAmount,
    calculatedAt: nowStr
  };

  resultEmpty.hidden = true;
  resultContent.hidden = false;
}

function hideResults() {
  resultEmpty.hidden = false;
  resultContent.hidden = true;
  lastSummaryData = null;
}

function tryCalculate() {
  const purchase = fields.purchaseDate.value;
  const expiry = fields.expiryDate.value;
  const stop = fields.stopDate.value;
  const price = parsePriceInput(fields.totalPrice.value);

  updateHints(purchase, expiry, stop);

  const error = validate(purchase, expiry, stop, price);
  if (error) {
    if (purchase || expiry || stop || fields.totalPrice.value) {
      showError(error);
    } else {
      clearError();
    }
    hideResults();
    return;
  }

  clearError();
  const data = calculateRefund(purchase, expiry, stop, price);
  showResults(data, purchase, expiry, stop);
}

function addDaysToDate(dateStr, days) {
  const dayNum = toDayNumber(parseDateString(dateStr)) + days - 1;
  return toInputDate(dayNum);
}

fields.totalPrice.addEventListener('input', (e) => {
  const cursorPos = e.target.selectionStart;
  const oldLen = e.target.value.length;
  e.target.value = formatPriceInput(e.target.value);
  const newLen = e.target.value.length;
  e.target.setSelectionRange(Math.max(0, cursorPos + (newLen - oldLen)), Math.max(0, cursorPos + (newLen - oldLen)));
  tryCalculate();
});

['purchaseDate', 'expiryDate', 'stopDate'].forEach((key) => {
  fields[key].addEventListener('change', tryCalculate);
  fields[key].addEventListener('input', tryCalculate);
});

document.querySelectorAll('.chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    const purchase = fields.purchaseDate.value;
    if (!purchase) {
      showError('Hãy chọn ngày mua trước khi dùng gói nhanh.');
      fields.purchaseDate.focus();
      return;
    }
    const days = Number(chip.dataset.days);
    fields.expiryDate.value = addDaysToDate(purchase, days);
    tryCalculate();
  });
});

document.getElementById('btn-today').addEventListener('click', () => {
  fields.stopDate.value = getTodayVN();
  tryCalculate();
});

document.getElementById('btn-reset').addEventListener('click', () => {
  form.reset();
  clearError();
  hideResults();
  lastRefundRaw = 0;
  Object.values(hints).forEach((h) => {
    h.textContent = '';
    h.classList.remove('active');
  });
});

document.getElementById('btn-copy').addEventListener('click', async () => {
  const text = formatVND(lastRefundRaw);
  try {
    await navigator.clipboard.writeText(text);
    const btn = document.getElementById('btn-copy');
    btn.classList.add('copied');
    setTimeout(() => btn.classList.remove('copied'), 2000);
  } catch {
    showError('Không thể sao chép — hãy chọn và copy thủ công.');
  }
});

// Format full summary for quick customer copy
function formatSummaryText(data) {
  if (!data) return '';
  const originalPrice = data.usedFee + data.refundAmount;
  return [
    '=== KẾT QUẢ HOÀN TIỀN (Refund Tool) ===',
    `Ngày mua: ${formatVNDate(data.purchase)}`,
    `Ngày dừng sử dụng: ${formatVNDate(data.stop)}`,
    `Ngày hết hạn gói: ${formatVNDate(data.expiry)}`,
    '',
    `Tổng giá trị gói: ${formatVND(originalPrice)}`,
    `Tổng thời gian gói: ${data.totalDays} ngày`,
    `Đã sử dụng: ${data.usedDays} ngày (${data.usedPct}%)`,
    `Còn lại: ${data.remainingDays} ngày`,
    '',
    `Phí đã dùng: ${formatVND(data.usedFee)}`,
    `Số tiền hoàn trả: ${formatVND(data.refundAmount)}`,
    `Tỷ lệ hoàn tiền: ${data.refundPct}%`,
    '',
    `Cập nhật: ${data.calculatedAt}`,
    '====================================='
  ].join('\n');
}

document.getElementById('btn-copy-summary').addEventListener('click', async () => {
  if (!lastSummaryData) return;

  const text = formatSummaryText(lastSummaryData);
  try {
    await navigator.clipboard.writeText(text);
    const btn = document.getElementById('btn-copy-summary');
    const originalText = btn.innerHTML;
    btn.innerHTML = '✓ Đã copy!';
    setTimeout(() => {
      btn.innerHTML = originalText;
    }, 1800);
  } catch {
    showError('Không thể sao chép. Vui lòng copy thủ công.');
  }
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  tryCalculate();
  if (!resultContent.hidden) {
    document.getElementById('result-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
});