/**
 * Small line drawings for the "Add NextTram to your assistant" steps, one per kind of action.
 * Colours come from CSS classes (styles.css, .art-*), so they follow light and dark mode.
 *   s = soft fill   c = card fill   l = line   g = accent (green)   gs = accent stroke   t = text fill
 */

const phone = (inner) => `
  <rect class="c l" x="72" y="6" width="56" height="108" rx="10"/>
  <rect class="s" x="92" y="11" width="16" height="3" rx="1.5"/>${inner}`;

const finger = (x, y) => `
  <circle class="ring" cx="${x}" cy="${y}" r="13"/>
  <circle class="g" cx="${x}" cy="${y}" r="5"/>`;

const waves = (x, y) => `
  <path class="gs" d="M${x} ${y - 10}q8 10 0 20"/>
  <path class="gs" d="M${x + 9} ${y - 17}q13 17 0 34"/>`;

export const ART = {
  // A browser window with an address bar.
  browser: `
    <rect class="c l" x="20" y="12" width="160" height="96" rx="10"/>
    <path class="l" d="M20 34h160"/>
    <circle class="s" cx="33" cy="23" r="3.5"/><circle class="s" cx="44" cy="23" r="3.5"/><circle class="s" cx="55" cy="23" r="3.5"/>
    <rect class="s" x="66" y="17" width="104" height="12" rx="6"/>
    <rect class="g" x="72" y="21" width="44" height="4" rx="2"/>
    <rect class="s" x="36" y="48" width="72" height="8" rx="4"/>
    <rect class="s" x="36" y="64" width="128" height="6" rx="3"/>
    <rect class="s" x="36" y="76" width="110" height="6" rx="3"/>
    <rect class="gfill" x="36" y="88" width="48" height="12" rx="6"/>
    ${finger(80, 94)}`,

  // A settings list: tap "+" to add something.
  add: `
    <rect class="c l" x="34" y="12" width="132" height="96" rx="10"/>
    <rect class="s" x="48" y="26" width="60" height="8" rx="4"/>
    <circle class="gfill" cx="146" cy="30" r="10"/>
    <path class="plus" d="M146 25v10M141 30h10"/>
    <path class="l" d="M34 46h132M34 66h132M34 86h132"/>
    <rect class="s" x="48" y="53" width="78" height="6" rx="3"/>
    <rect class="s" x="48" y="73" width="64" height="6" rx="3"/>
    <rect class="s" x="48" y="93" width="70" height="6" rx="3"/>
    ${finger(152, 36)}`,

  // A switch turned on.
  toggle: `
    <rect class="c l" x="34" y="22" width="132" height="76" rx="10"/>
    <rect class="s" x="50" y="40" width="58" height="8" rx="4"/>
    <rect class="s" x="50" y="56" width="40" height="6" rx="3"/>
    <rect class="gfill" x="118" y="38" width="34" height="20" rx="10"/>
    <circle class="c" cx="142" cy="48" r="7"/>
    <path class="l" d="M34 74h132"/>
    <rect class="s" x="50" y="82" width="70" height="6" rx="3"/>
    ${finger(130, 62)}`,

  // A text field with a link being pasted.
  paste: `
    <rect class="c l" x="22" y="18" width="156" height="84" rx="10"/>
    <rect class="s" x="36" y="30" width="40" height="6" rx="3"/>
    <rect class="c gs" x="36" y="42" width="128" height="20" rx="6"/>
    <path class="gs" d="M46 52h3M53 52h3"/>
    <rect class="g" x="60" y="49" width="78" height="6" rx="3"/>
    <rect class="s" x="36" y="72" width="40" height="6" rx="3"/>
    <rect class="s" x="36" y="84" width="128" height="8" rx="4"/>
    <rect class="c l" x="142" y="66" width="30" height="38" rx="5"/>
    <rect class="gfill" x="150" y="62" width="14" height="8" rx="3"/>
    <path class="l" d="M149 80h16M149 88h16M149 96h10"/>`,

  // A dialog with a big tick.
  done: `
    <rect class="c l" x="40" y="14" width="120" height="92" rx="12"/>
    <circle class="gfill" cx="100" cy="50" r="20"/>
    <path class="tick" d="M90 50l7 7 13-14"/>
    <rect class="s" x="66" y="80" width="68" height="7" rx="3.5"/>
    <rect class="s" x="78" y="92" width="44" height="5" rx="2.5"/>`,

  // A chat: question and answer.
  chat: `
    <rect class="s" x="78" y="16" width="100" height="26" rx="13"/>
    <rect class="t" x="92" y="26" width="70" height="6" rx="3"/>
    <rect class="c l" x="22" y="52" width="122" height="40" rx="14"/>
    <circle class="gfill" cx="40" cy="72" r="8"/>
    <rect class="g" x="56" y="64" width="72" height="6" rx="3"/>
    <rect class="s" x="56" y="76" width="50" height="6" rx="3"/>
    <rect class="s" x="22" y="100" width="156" height="12" rx="6"/>`,

  // Someone speaks; the assistant answers.
  speak: `
    <circle class="c l" cx="62" cy="60" r="34"/>
    <rect class="gfill" x="54" y="40" width="16" height="28" rx="8"/>
    <path class="gs" d="M47 60a15 15 0 0 0 30 0M62 75v8"/>
    ${waves(104, 60)}
    <rect class="c l" x="128" y="34" width="56" height="34" rx="12"/>
    <rect class="g" x="138" y="45" width="36" height="5" rx="2.5"/>
    <rect class="s" x="138" y="55" width="24" height="5" rx="2.5"/>`,

  // A phone home screen with the NextTram icon arriving.
  install: phone(`
    <rect class="s" x="80" y="24" width="12" height="12" rx="3"/><rect class="s" x="96" y="24" width="12" height="12" rx="3"/><rect class="s" x="112" y="24" width="12" height="12" rx="3"/>
    <rect class="s" x="80" y="42" width="12" height="12" rx="3"/><rect class="s" x="96" y="42" width="12" height="12" rx="3"/>
    <rect class="gfill" x="110" y="58" width="16" height="16" rx="4"/>
    <path class="plus" d="M118 62v8M114 66h8"/>
    <path class="gs" d="M150 24v30M141 46l9 9 9-9"/>`),

  // A list of trips, the first one highlighted.
  first: `
    <rect class="c gs" x="36" y="14" width="128" height="28" rx="9"/>
    <path class="star" d="M54 21l2.4 5 5.4.6-4 3.7 1.1 5.3-4.9-2.7-4.9 2.7 1.1-5.3-4-3.7 5.4-.6z"/>
    <rect class="t" x="70" y="22" width="60" height="6" rx="3"/>
    <rect class="s" x="70" y="32" width="40" height="4" rx="2"/>
    <rect class="c l" x="36" y="50" width="128" height="26" rx="9"/>
    <rect class="s" x="70" y="58" width="52" height="6" rx="3"/>
    <rect class="c l" x="36" y="84" width="128" height="26" rx="9"/>
    <rect class="s" x="70" y="92" width="58" height="6" rx="3"/>`,

  // Two number boxes and a button.
  number: `
    <rect class="c l" x="30" y="14" width="140" height="92" rx="12"/>
    <rect class="c gs" x="66" y="28" width="30" height="38" rx="7"/>
    <rect class="c gs" x="104" y="28" width="30" height="38" rx="7"/>
    <text class="num" x="81" y="55">4</text><text class="num" x="119" y="55">2</text>
    <rect class="gfill" x="60" y="78" width="80" height="16" rx="8"/>
    ${finger(116, 88)}`,

  // A shortcut being built from two blocks.
  shortcut: `
    <rect class="c l" x="38" y="10" width="124" height="100" rx="12"/>
    <rect class="gfill" x="52" y="24" width="96" height="26" rx="7"/>
    <rect class="c" x="60" y="34" width="54" height="6" rx="3"/>
    <path class="l" d="M100 50v10"/>
    <rect class="s" x="52" y="60" width="96" height="26" rx="7"/>
    <rect class="g" x="60" y="70" width="40" height="6" rx="3"/>
    <rect class="s" x="66" y="94" width="68" height="6" rx="3"/>`,

  // A loudspeaker reading text aloud.
  speaker: `
    <rect class="c l" x="34" y="30" width="72" height="60" rx="10"/>
    <rect class="s" x="46" y="44" width="48" height="6" rx="3"/>
    <rect class="s" x="46" y="56" width="40" height="6" rx="3"/>
    <rect class="s" x="46" y="68" width="44" height="6" rx="3"/>
    <path class="gfill" d="M120 52h8l12-10v36l-12-10h-8z"/>
    ${waves(150, 60)}`,
};

export const art = (key) =>
  ART[key] ? `<svg class="art" viewBox="0 0 200 120" aria-hidden="true" focusable="false">${ART[key]}</svg>` : '';
