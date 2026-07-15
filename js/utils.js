/* ============================================================
   UTILS.JS — shared helper functions
   ============================================================ */

const Utils = (() => {

  /** Format a number as currency using the active currency setting */
  function formatCurrency(amount, currency) {
    const cur = currency || (Storage.getAppSettings().currency) || 'KSh';
    const n = Number(amount) || 0;
    const sign = n < 0 ? '-' : '';
    const abs = Math.abs(n);
    return `${sign}${cur} ${abs.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }

  /** Format a plain number with thousands separators */
  function formatNumber(n) {
    return Math.round(Number(n) || 0).toLocaleString('en-KE');
  }

  /** yyyy-mm-dd for a Date object, in local time */
  function toDateStr(d) {
    const dt = new Date(d);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /** Today's date string */
  function todayStr() {
    return toDateStr(new Date());
  }

  /** Difference in whole days between two date strings (b - a) */
  function daysBetween(aStr, bStr) {
    const a = new Date(aStr + 'T00:00:00');
    const b = new Date(bStr + 'T00:00:00');
    return Math.round((b - a) / (1000 * 60 * 60 * 24));
  }

  /** Human readable long date, e.g. "7 July 2026" */
  function prettyDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  /** Short weekday-month-day, e.g. "Tue, 7 Jul" */
  function shortDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  /** Clamp a number between min and max */
  function clamp(n, min, max) {
    return Math.min(Math.max(n, min), max);
  }

  /** Debounce a function call */
  function debounce(fn, wait) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  /** Animate a numeric counter from a start to an end value inside an element */
  function animateCounter(el, endValue, opts = {}) {
    const duration = opts.duration || 900;
    const isCurrency = !!opts.currency;
    const decimals = opts.decimals || 0;
    const startValue = opts.from != null ? opts.from : 0;
    const startTime = performance.now();

    function frame(now) {
      const progress = Utils.clamp((now - startTime) / duration, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out-cubic
      const current = startValue + (endValue - startValue) * eased;
      if (isCurrency) {
        el.textContent = formatCurrency(current);
      } else {
        el.textContent = current.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      }
      if (progress < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /** Generate a unique id */
  function uid() {
    return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  /** Simple confetti burst using canvas-free DOM particles */
  function confettiBurst(count = 120) {
    const colors = ['#d4af37', '#f4d976', '#ffffff', '#8a6d1a', '#e8c766'];
    const container = document.createElement('div');
    container.className = 'confetti-container';
    document.body.appendChild(container);
    for (let i = 0; i < count; i++) {
      const piece = document.createElement('span');
      piece.className = 'confetti-piece';
      piece.style.left = Math.random() * 100 + 'vw';
      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
      piece.style.animationDuration = (2 + Math.random() * 1.8) + 's';
      piece.style.animationDelay = (Math.random() * 0.6) + 's';
      piece.style.width = piece.style.height = (5 + Math.random() * 6) + 'px';
      piece.style.transform = `rotate(${Math.random() * 360}deg)`;
      container.appendChild(piece);
    }
    setTimeout(() => container.remove(), 4200);
  }

  /**
   * Read an image file, downscale it, and return a compressed base64 JPEG
   * data URL — keeps localStorage usage reasonable regardless of the
   * original photo's resolution/file size.
   */
  function compressImageFile(file, maxDimension = 900, quality = 0.82) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith('image/')) {
        reject(new Error('Not an image file'));
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read file'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Could not decode image'));
        img.onload = () => {
          let { width, height } = img;
          if (width > maxDimension || height > maxDimension) {
            if (width >= height) {
              height = Math.round(height * (maxDimension / width));
              width = maxDimension;
            } else {
              width = Math.round(width * (maxDimension / height));
              height = maxDimension;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /** Download a Blob as a file */
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const MOTIVATIONAL_QUOTES = [
    "Every shilling saved is a mile closer to the driver's seat.",
    "Discipline today. Forester tomorrow.",
    "Small daily wins compound into big keys.",
    "You're not saving money. You're buying freedom on four wheels.",
    "Consistency is the engine. Patience is the fuel.",
    "The dashboard doesn't lie — you're closer than yesterday.",
    "Skip the excuse, log the entry, keep the streak.",
    "Print. Trade. Save. Repeat.",
    "Your future Forester is financed by today's discipline.",
    "Progress parked is progress lost. Log today's entry.",
    "The road to July 2027 is paved with daily deposits.",
    "Every entry is a step nobody can take back from you.",
  ];

  function quoteOfTheDay() {
    const start = new Date(2026, 0, 1);
    const days = Math.floor((new Date() - start) / (1000 * 60 * 60 * 24));
    return MOTIVATIONAL_QUOTES[Math.abs(days) % MOTIVATIONAL_QUOTES.length];
  }

  return {
    formatCurrency, formatNumber, toDateStr, todayStr, daysBetween,
    prettyDate, shortDate, clamp, debounce, animateCounter, uid,
    confettiBurst, downloadBlob, quoteOfTheDay, compressImageFile
  };
})();
