const weekHistoryPrefix = 'turnip-history:v1:';
const historyPatternKeys = ['fluctuating', 'large-spike', 'decreasing', 'small-spike'];
const historyDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function historyWeekStart(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value + 'T00:00:00Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return date.getUTCFullYear() > 0 ? date.toISOString().slice(0, 10) : null;
}

function readWeekHistory(storage) {
  const weeks = [];
  let unreadable = false;
  const validPrice = price => price === null || (Number.isSafeInteger(price) && price > 0);
  const validPattern = pattern => Number.isInteger(pattern) && pattern >= 0 && pattern < historyPatternKeys.length;

  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(weekHistoryPrefix)) continue;
    try {
      const week = JSON.parse(storage.getItem(key));
      if (!week || key !== weekHistoryPrefix + week.weekOf || historyWeekStart(week.weekOf) !== week.weekOf ||
          !validPrice(week.buyPrice) || !Array.isArray(week.sellPrices) || week.sellPrices.length !== 12 ||
          !week.sellPrices.every(validPrice) || !week.sellPrices.some(price => price !== null) ||
          typeof week.firstBuy !== 'boolean' || (week.previousPattern !== -1 && !validPattern(week.previousPattern)) ||
          (week.pattern !== null && !validPattern(week.pattern))) {
        unreadable = true;
        continue;
      }
      weeks.push({ ...week, high: Math.max(...week.sellPrices) });
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      unreadable = true;
    }
  }
  weeks.sort((a, b) => b.weekOf.localeCompare(a.weekOf));
  return { weeks, unreadable };
}

function initializeWeekHistory(readCurrentWeek) {
  const panel = document.getElementById('weekly-history');
  if (!panel) return;

  const byId = id => document.getElementById(id);
  const dateInput = byId('history-date');
  const form = byId('history-form');
  const status = byId('history-status');
  const results = byId('history-results');
  const empty = byId('history-empty');
  const weeksList = byId('history-weeks');
  let chart;

  const today = new Date();
  const localDate = [today.getFullYear(), today.getMonth() + 1, today.getDate()]
    .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, '0')).join('-');
  dateInput.value = historyWeekStart(localDate);

  const t = (key, options) => i18next.t(key, options);
  const dateLabel = date => new Intl.DateTimeFormat(i18next.resolvedLanguage, { dateStyle: 'medium', timeZone: 'UTC' })
    .format(new Date(date + 'T00:00:00Z'));
  const numbers = () => new Intl.NumberFormat(i18next.resolvedLanguage, { maximumFractionDigits: 1 });
  const patternLabel = pattern => t('patterns.' + historyPatternKeys[pattern]);
  const priceLabel = (price, format) => price === null ? '—' : format.format(price);

  function element(tag, text) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function showStatus(key, date) {
    status.textContent = key ? t('history.' + key, {
      date: date ? dateLabel(date) : undefined,
      interpolation: { escapeValue: false },
    }) : '';
  }

  function confirmWeek(key, date) {
    return window.confirm(t('history.' + key, { date: dateLabel(date), interpolation: { escapeValue: false } }));
  }

  function renderChart(weeks) {
    if (chart) chart.destroy();
    chart = undefined;
    if (!weeks.length || typeof Chart !== 'function') return;
    const chronological = [...weeks].reverse();
    const color = getComputedStyle(panel).color;
    chart = new Chart(byId('history-chart'), {
      type: 'line',
      data: {
        labels: chronological.map(week => dateLabel(week.weekOf)),
        datasets: [
          { label: t('history.weekly-high'), data: chronological.map(week => week.high), borderColor: color, backgroundColor: color },
          { label: t('history.sunday-price'), data: chronological.map(week => week.buyPrice), borderColor: color, backgroundColor: color, borderDash: [5, 4] },
        ],
      },
      options: {
        color,
        maintainAspectRatio: false,
        animation: false,
        scales: { x: { ticks: { color, maxTicksLimit: 6 } }, y: { ticks: { color } } },
      },
    });
  }

  function renderPatterns(weeks, format) {
    const counts = [0, 0, 0, 0, 0];
    weeks.forEach(week => { counts[week.pattern ?? 4]++; });
    byId('history-patterns').replaceChildren(...counts.map((count, pattern) => {
      const label = pattern === 4 ? t('history.unknown') : patternLabel(pattern);
      const row = element('li');
      const meter = element('meter');
      meter.max = weeks.length;
      meter.value = count;
      meter.setAttribute('aria-hidden', 'true');
      row.append(element('span', label + ' · ' + format.format(count)), meter);
      return row;
    }));
  }

  function renderWeek(week, format, open) {
    const details = element('details');
    details.dataset.week = week.weekOf;
    details.open = open;
    const label = t('history.week-of', { date: dateLabel(week.weekOf), interpolation: { escapeValue: false } });
    const pattern = week.pattern === null ? t('history.unknown') : patternLabel(week.pattern);
    details.append(element('summary', [label, pattern, priceLabel(week.high, format)].join(' · ')));

    const settings = element('dl');
    settings.className = 'history-settings';
    for (const [name, value] of [
      [t('history.sunday-price'), priceLabel(week.buyPrice, format)],
      [t('patterns.title'), week.previousPattern === -1 ? t('patterns.unknown') : patternLabel(week.previousPattern)],
      [t('first-time.title'), t(week.firstBuy ? 'first-time.yes' : 'first-time.no')],
    ]) {
      const entry = element('div');
      entry.append(element('dt', name), element('dd', value));
      settings.append(entry);
    }
    details.append(settings);

    const table = element('table');
    table.className = 'history-prices';
    const header = table.createTHead().insertRow();
    for (const heading of ['history.day', 'times.morning', 'times.afternoon']) {
      const cell = element('th', t(heading));
      cell.scope = 'col';
      header.append(cell);
    }
    table.createCaption().textContent = t('history.recorded-prices');
    const body = table.createTBody();
    historyDays.forEach((day, index) => {
      const row = body.insertRow();
      const heading = element('th', t('weekdays.' + day));
      heading.scope = 'row';
      row.append(heading, ...week.sellPrices.slice(index * 2, index * 2 + 2)
        .map(price => element('td', priceLabel(price, format))));
    });
    details.append(table);

    const remove = element('button', t('history.delete'));
    remove.type = 'button';
    remove.className = 'button button--reset';
    remove.addEventListener('click', () => {
      if (!confirmWeek('delete-warning', week.weekOf)) return;
      try {
        window.localStorage.removeItem(weekHistoryPrefix + week.weekOf);
      } catch {
        showStatus('storage-error');
        return;
      }
      if (render()) showStatus('deleted', week.weekOf);
      dateInput.focus();
    });
    details.append(remove);
    return details;
  }

  function render() {
    let history;
    try {
      history = readWeekHistory(window.localStorage);
    } catch {
      empty.hidden = true;
      results.hidden = true;
      showStatus('storage-error');
      return false;
    }
    const { weeks, unreadable } = history;
    empty.hidden = weeks.length > 0 || unreadable;
    results.hidden = weeks.length === 0;
    const format = numbers();
    const highs = weeks.map(week => week.high);
    byId('history-count').textContent = format.format(weeks.length);
    byId('history-best').textContent = weeks.length ? format.format(highs.reduce((max, high) => Math.max(max, high))) : '';
    byId('history-average').textContent = weeks.length
      ? format.format(highs.reduce((mean, high) => mean + high / weeks.length, 0)) : '';
    const openWeeks = new Set([...weeksList.querySelectorAll('details[open]')].map(node => node.dataset.week));
    weeksList.replaceChildren(...weeks.map(week => renderWeek(week, format, openWeeks.has(week.weekOf))));
    if (weeks.length) renderPatterns(weeks, format);
    renderChart(weeks);
    showStatus(unreadable ? 'unreadable' : null);
    return true;
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    const weekOf = historyWeekStart(dateInput.value);
    if (!weekOf) {
      showStatus('invalid-date');
      return;
    }
    const { buyPrice, sellPrices, firstBuy, previousPattern } = readCurrentWeek();
    if (sellPrices.every(price => price === null)) {
      showStatus('no-prices');
      return;
    }
    // The predictor treats NaN as an unobserved slot, while saved records use null.
    const prices = [buyPrice, buyPrice, ...sellPrices].map(price => price ?? NaN);
    const predictor = new Predictor(prices, firstBuy, previousPattern);
    const matches = get_pattern_probabilities(predictor.analyze_possibilities());
    const pattern = matches.length === 1 ? matches[0].pattern_number : null;
    const key = weekHistoryPrefix + weekOf;
    try {
      const storage = window.localStorage;
      if (storage.getItem(key) !== null && !confirmWeek('replace-warning', weekOf)) return;
      storage.setItem(key, JSON.stringify({ weekOf, buyPrice, sellPrices, firstBuy, previousPattern, pattern }));
    } catch {
      showStatus('storage-error');
      return;
    }
    dateInput.value = weekOf;
    if (render()) showStatus('saved', weekOf);
  });

  panel.addEventListener('toggle', () => { if (panel.open) render(); });
  window.addEventListener('storage', event => {
    if (panel.open && (event.key === null || event.key.startsWith(weekHistoryPrefix))) render();
  });
  i18next.on('languageChanged', () => { if (panel.open) render(); });
  const themeObserver = new MutationObserver(() => { if (panel.open) render(); });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}
