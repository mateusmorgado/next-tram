/**
 * Drawn iPhone screens for the Siri guide: one picture per tap in Apple's Shortcuts app.
 *
 * They are not screenshots but simplified drawings of the real screens (iOS 18 and 26), cropped to
 * the part that matters, with the button to tap marked by a green dot. The words on them come from
 * shortcutsUi.* in src/i18n/*.ts, so they match what an iPhone in that language shows.
 * Colours come from CSS classes (styles.css, .art-*), so they follow light and dark mode.
 */
import { t, tx } from '../../i18n/index.ts';
import { esc } from '../dom.ts';

/** The labels of the Shortcuts app in the current language (shortcutsUi.*). */
type Ui = Record<string, string>;

const finger = (x: number, y: number) => `
  <circle class="ring" cx="${x}" cy="${y}" r="13"/>
  <circle class="g" cx="${x}" cy="${y}" r="5"/>`;

/** One line of text. `cls` picks size and colour (see .art .tx* in styles.css). */
const text = (x: number, y: number, s: string, cls = 'tx', anchor = 'start') =>
  `<text class="${cls}" x="${x}" y="${y}" text-anchor="${anchor}">${esc(s)}</text>`;

/** Splits text into lines of at most `max` characters, at spaces. */
function wrap(s: string, max: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of s.split(/\s+/)) {
    if (line && (line + ' ' + word).length > max) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

/** The top of an iPhone screen; the rest is cut off at the bottom of the picture. */
const phoneTop = (inner: string, extra = '') => `
  <rect class="c l" x="24" y="6" width="192" height="180" rx="26"/>${extra}
  <rect class="island" x="98" y="13" width="44" height="12" rx="6"/>
  ${text(44, 23, '9:41', 'tx-s b')}${inner}`;

/** The bottom of an iPhone screen, with the home bar. */
const phoneBottom = (inner: string) => `
  <rect class="c l" x="24" y="-40" width="192" height="184" rx="26"/>${inner}
  <rect class="t" x="96" y="135" width="48" height="3" rx="1.5"/>`;

/** Action icons: a blue globe (web), a grey speaker (Speak Text). */
const globe = (x: number, y: number) => `
  <rect class="ios" x="${x}" y="${y}" width="16" height="16" rx="4"/>
  <circle class="ico" cx="${x + 8}" cy="${y + 8}" r="4.5"/><path class="ico" d="M${x + 3.5} ${y + 8}h9M${x + 8} ${y + 3.5}q-3 4.5 0 9q3 -4.5 0 -9"/>`;
const speakerIcon = (x: number, y: number) => `
  <rect class="dark" x="${x}" y="${y}" width="16" height="16" rx="4"/>
  <path class="ico-fill" d="M${x + 3.5} ${y + 6.5}h2.5l3.5 -3v9l-3.5 -3h-2.5z"/><path class="ico" d="M${x + 11.5} ${y + 5.5}q2 2.5 0 5"/>`;

/** The title of the shortcut being edited, with its small menu arrow. */
const title = (s: string) => `${text(120, 44, s, 'tx b', 'middle')}<path class="chev" d="M${120 + s.length * 2.6 + 4} 40l3 3 3-3"/>`;

/** An action in the editor: icon, name, and the blue value under it. */
const action = (y: number, icon: string, name: string, value: string, mono = false) => `
  <rect class="soft" x="36" y="${y}" width="168" height="38" rx="10"/>${icon}
  ${text(64, y + 15, name, 'tx b')}
  <rect class="ios-soft" x="64" y="${y + 20}" width="${Math.min(132, value.length * (mono ? 4.3 : 4.9) + 10)}" height="12" rx="4"/>
  ${text(69, y + 29, value, mono ? 'tx-ios mono' : 'tx-ios')}`;

/** The action search at the bottom of the editor, with the typed words and the result to tap. */
const search = (u: Ui, query: string, icon: (x: number, y: number) => string) => phoneBottom(`
  <rect class="soft" x="34" y="20" width="172" height="110" rx="18"/>
  <rect class="c" x="44" y="30" width="152" height="22" rx="11"/>
  <circle class="mag" cx="56" cy="40" r="3.5"/><path class="mag" d="M58.5 42.5l3 3"/>
  ${text(66, 44, query, 'tx')}<rect class="t" x="${67 + query.length * 4.6}" y="35" width="1.2" height="12"/>
  ${text(46, 68, u.results, 'tx-s up')}
  <rect class="c gs" x="42" y="74" width="156" height="26" rx="9"/>${icon(48, 79)}
  ${text(70, 90, query, 'tx b')}
  <rect class="c" x="42" y="104" width="156" height="20" rx="9"/><rect class="s" x="70" y="111" width="70" height="6" rx="3"/>
  ${finger(56, 87)}`);

/** A grid of shortcut tiles, as on the Shortcuts tab. */
const tiles = (y: number, names: string[] = []) => [0, 1, 2, 3].map((n) => {
  const x = n % 2 ? 124 : 38;
  const ty = y + Math.floor(n / 2) * 42;
  return `<rect class="tile tile${n}" x="${x}" y="${ty}" width="78" height="36" rx="9"/>
    <circle class="tile-ico" cx="${x + 11}" cy="${ty + 11}" r="4.5"/>
    ${names[n] ? text(x + 6, ty + 30, names[n], 'tx-tile') : `<rect class="tile-ico" x="${x + 6}" y="${ty + 24}" width="40" height="5" rx="2.5"/>`}`;
}).join('');

const SCREENS: Record<string, (u: Ui) => string> = {
  // NextTram on the iPhone: copy the personal link.
  'ios-copy': (u) => phoneTop(`
    ${text(40, 52, 'NextTram', 'tx-l b')}
    <rect class="soft" x="36" y="62" width="168" height="72" rx="12"/>
    <rect class="c gs" x="44" y="70" width="152" height="22" rx="6"/>
    ${text(50, 84, '…/api/say?code=…', 'tx-s mono')}
    <rect class="gfill" x="122" y="100" width="74" height="24" rx="12"/>
    ${text(159, 116, u.copy, 'tx-go', 'middle')}
    ${finger(190, 120)}`),

  // The Shortcuts app: the + at the top right.
  'ios-plus': (u) => phoneTop(`
    <circle class="soft" cx="190" cy="40" r="11"/><path class="plus-d" d="M190 35v10M185 40h10"/>
    ${text(38, 66, u.app, 'tx-xl b')}
    ${tiles(76)}
    ${finger(190, 40)}`),

  // Search "Get Contents of URL" and tap it.
  'ios-search-url': (u) => search(u, u.getUrl, globe),

  // Tap the blue "URL", then Paste.
  'ios-paste': (u) => phoneTop(`
    ${title(u.newShortcut)}
    <rect class="soft" x="36" y="56" width="168" height="38" rx="10"/>${globe(44, 63)}
    ${text(66, 71, u.getUrl, 'tx b')}
    <rect class="ios-soft gs" x="66" y="76" width="30" height="13" rx="4"/>${text(81, 86, 'URL', 'tx-ios b', 'middle')}
    <path class="bubble" d="M81 98l6 7h-12z"/>
    <rect class="bubble" x="56" y="104" width="${u.paste.length * 5.4 + 28}" height="24" rx="12"/>
    ${text(70, 120, u.paste, 'tx-bubble')}
    ${finger(56 + u.paste.length * 5.4 + 24, 124)}`),

  // Search "Speak Text" and tap it.
  'ios-search-speak': (u) => search(u, u.speak, speakerIcon),

  // Both actions in place.
  'ios-check': (u) => phoneTop(`
    ${title(u.newShortcut)}
    ${action(54, globe(44, 61), u.getUrl, 'nexttram.morgado.tech/…', true)}
    ${action(98, speakerIcon(44, 105), u.speak, u.contents)}
    <circle class="gfill" cx="204" cy="98" r="9"/><path class="tick-s" d="M199.5 98l3 3 6-6"/>`),

  // The name at the top opens a menu: Rename.
  'ios-rename': (u) => phoneTop(`
    ${title(u.newShortcut)}
    <rect class="menu" x="44" y="52" width="160" height="88" rx="14"/>
    <rect class="ring" x="48" y="56" width="152" height="20" rx="8"/>
    <path class="pen" d="M58 71l1-4 7-7 3 3-7 7z"/>${text(76, 70, u.rename, 'tx b')}
    <path class="l thin" d="M56 81h136"/>
    <rect class="s" x="58" y="89" width="7" height="7" rx="2"/>${text(76, 96, u.icon, 'tx-2')}
    <rect class="s" x="58" y="105" width="7" height="7" rx="2"/>${text(76, 112, u.duplicate, 'tx-2')}
    <rect class="s" x="58" y="121" width="7" height="7" rx="2"/>${text(76, 128, u.home, 'tx-2')}
    ${finger(176, 66)}`),

  // Type the name, then Done.
  'ios-name': (u) => phoneTop(`
    <rect class="ios" x="${200 - u.done.length * 5.6 - 16}" y="30" width="${u.done.length * 5.6 + 16}" height="20" rx="10"/>
    ${text(200 - (u.done.length * 5.6 + 16) / 2, 44, u.done, 'tx-btn', 'middle')}
    <rect class="c gs" x="36" y="58" width="168" height="24" rx="8"/>
    ${text(44, 74, u.name, 'tx b')}
    <rect class="soft" x="36" y="90" width="168" height="24" rx="8"/>${globe(42, 94)}<rect class="s" x="64" y="99" width="80" height="6" rx="3"/>
    <rect class="soft" x="36" y="120" width="168" height="24" rx="8"/>${speakerIcon(42, 124)}<rect class="s" x="64" y="129" width="60" height="6" rx="3"/>
    ${finger(198, 50)}`),

  // Run it once and allow it to reach NextTram.
  'ios-allow': (u) => phoneTop(`
    <g class="faded">${tiles(36, [u.name])}</g>
    <rect class="menu" x="42" y="34" width="156" height="110" rx="18"/>
    ${wrap(u.allow, 30).slice(0, 2).map((line, n) => text(120, 50 + n * 11, line, 'tx b', 'middle')).join('')}
    ${text(120, 73, 'app.nexttram.morgado.tech', 'tx-s', 'middle')}
    <rect class="soft" x="52" y="80" width="136" height="17" rx="8.5"/>${text(120, 91.5, u.once, 'tx-ios', 'middle')}
    <rect class="ios" x="52" y="101" width="136" height="17" rx="8.5"/>${text(120, 112.5, u.always, 'tx-btn', 'middle')}
    <rect class="soft" x="52" y="122" width="136" height="17" rx="8.5"/>${text(120, 133.5, u.deny, 'tx-ios', 'middle')}
    ${finger(182, 112)}`),

  // "Hey Siri, …" and Siri's answer.
  'ios-siri': (u) => {
    const ask = wrap(u.ask, 30);
    const answer = wrap(u.example, 30).slice(0, 3);
    const askH = ask.length * 11 + 10;
    const ansY = 40 + askH + 8;
    return phoneTop(`
      <rect class="gfill" x="${204 - 150}" y="40" width="150" height="${askH}" rx="12"/>
      ${ask.map((line, n) => text(62, 54 + n * 11, line, 'tx-go')).join('')}
      <rect class="soft" x="36" y="${ansY}" width="150" height="${answer.length * 11 + 10}" rx="12"/>
      ${answer.map((line, n) => text(44, ansY + 14 + n * 11, line, 'tx')).join('')}`,
    `<defs><linearGradient id="siriGlow" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ff9f0a"/><stop offset="0.35" stop-color="#ff375f"/><stop offset="0.65" stop-color="#bf5af2"/><stop offset="1" stop-color="#0a84ff"/>
    </linearGradient></defs><rect class="siri-glow" x="26" y="8" width="188" height="176" rx="24"/>`);
  },
};

/** The labels for the pictures: the iPhone's own words plus this user's shortcut name. */
function labels(): Ui {
  const u = { ...(tx('shortcutsUi') as Ui) };
  u.copy = t('ai.copy');
  u.name = t('voice.siriName');
  u.ask = t('voice.siri');
  u.example = t('voice.siriExample').replace(/[“”„"]/g, '');
  u.allow = u.allow.replace('{name}', `“${u.name}”`);
  return u;
}

/** The inner SVG of an iPhone picture, or undefined if `key` is not one. */
export function iosArt(key: string): string | undefined {
  const screen = SCREENS[key];
  return screen ? screen(labels()) : undefined;
}
