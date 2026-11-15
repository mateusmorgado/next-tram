/**
 * The "Add NextTram to your assistant" guides shown behind the AI button.
 *
 * Each guide is a short wizard: one screen per step, with a picture (lib/guide-art.js), a title,
 * one or two sentences, and at most one thing to tap, copy or type. `tip` is extra help that stays
 * folded under `tipLabel` until tapped. Keep it uncluttered: if a step needs a third sentence, it is two steps.
 *
 * Text is HTML with two kinds of placeholders, filled in by app.js:
 *   [[term:key|shown words]]  a word with a small (i); tapping it shows TERMS[key]
 *   [[copy:key]]              a box with something to copy (the user's link, the Alexa voice model, …)
 * Keep the language plain: short sentences, exact button names in bold.
 */

export const TERMS = {
  mcp: {
    title: 'What is MCP?',
    text: 'MCP is a common “plug” that AI assistants use to talk to other apps. Through it, the assistant can ask NextTram for live tram times. You don’t need to install anything: NextTram’s plug is already online, you only paste its link.',
  },
  connector: {
    title: 'What is a connector?',
    text: 'A connector is an add-on for the assistant. It gives the assistant access to one extra service, here NextTram, so it can answer with real tram times instead of guessing.',
  },
  link: {
    title: 'What is “your link”?',
    text: 'A web address made just for you. It ends with your personal code, which tells NextTram which favorites are yours. Keep it to yourself: anyone who has it can see your saved stops.',
  },
  code: {
    title: 'What is the personal code?',
    text: 'A random code this app made for you. Your favorites are saved online under it, so your assistant knows your stops too. It changes nothing on your phone and contains no name, email or password.',
  },
  first: {
    title: 'Why the first favorite?',
    text: 'When you just ask “when is the next tram”, the assistant needs to know which trip you mean. It always uses the favorite at the top of your list. To change it, open Your stops and move another route to the top.',
  },
  devmode: {
    title: 'What is Developer mode?',
    text: 'A switch in ChatGPT’s settings that allows adding your own connectors. Despite the name you don’t need to be a programmer, and you can turn it off again any time.',
  },
  shortcuts: {
    title: 'What is Shortcuts?',
    text: 'Shortcuts is a free Apple app that is already on every iPhone (look for the icon with two overlapping squares). It lets you make your own Siri commands. If you deleted it, get it again from the App Store.',
  },
  install: {
    title: 'What does “install” mean here?',
    text: 'It puts NextTram on your home screen like a normal app, with its own icon. Nothing is downloaded from a store and it takes no space worth mentioning. Then Google can open it by name.',
  },
  skill: {
    title: 'What is an Alexa skill?',
    text: 'A skill is an app for Alexa. Turning one on is free and takes a few seconds in the Alexa app.',
  },
  number: {
    title: 'What is the number for?',
    text: 'It tells NextTram which Alexa is yours, so Alexa can use the stops from this phone. It works once and only for 5 minutes. Alexa also shows it in the Alexa app under More → Activity.',
  },
  routine: {
    title: 'What is a routine?',
    text: 'A routine is your own Alexa command, made in the Alexa app. Here it lets you skip the skill’s name: Alexa hears “when is the next tram” and asks NextTram for you.',
  },
};

const go = (href, label) => `<a class="btn btn-primary ai-go" href="${href}" target="_blank" rel="noopener">${label}</a>`;

export const ASSISTANTS = [
  {
    key: 'claude',
    name: 'Claude',
    where: 'Phone, computer',
    time: '2 minutes',
    needs: 'A Claude account (the free one works).',
    steps: [
      {
        art: 'browser',
        title: 'Open Claude in a browser',
        text: 'Open <b>claude.ai</b> and sign in. You do this once in a web browser; afterwards it works in the Claude app too.',
        action: go('https://claude.ai', 'Open claude.ai'),
      },
      {
        art: 'add',
        title: 'Add a connector',
        text: 'In the menu on the left, open <b>Customize → Connectors</b>. Tap <b>+</b> → <b>Add custom [[term:connector|connector]]</b>.',
      },
      {
        art: 'paste',
        title: 'Paste your link',
        text: 'Name: <b>NextTram</b>. In <b>Remote [[term:mcp|MCP]] server URL</b>, paste [[term:link|your link]]:',
        action: '[[copy:mcp]]',
      },
      {
        art: 'done',
        title: 'Tap Add',
        text: 'NextTram now shows in your connectors.',
        tipLabel: 'Claude couldn’t check the server?',
        tip: 'Claude says it <b>couldn’t check the server</b>? That’s fine: NextTram needs no sign-in, your link is the key. Tap <b>Continue anyway</b>, and pick no sign-in if it asks.',
      },
      {
        art: 'chat',
        title: 'Ask Claude',
        text: 'Start a new chat and ask <b>“When is the next tram?”</b> The first time, tap <b>Always allow</b>.',
      },
    ],
  },
  {
    key: 'chatgpt',
    name: 'ChatGPT',
    where: 'Computer',
    time: '3 minutes',
    needs: 'A paid ChatGPT plan (Plus or higher) and a computer.',
    steps: [
      {
        art: 'browser',
        title: 'Open ChatGPT settings',
        text: 'On a computer, open <b>chatgpt.com</b> → your name (bottom left) → <b>Settings</b> → <b>Apps &amp; Connectors</b>.',
        action: go('https://chatgpt.com/#settings/Connectors', 'Open ChatGPT settings'),
        tipLabel: 'Menu names differ?',
        tip: 'ChatGPT renames its menus now and then. If a name differs, pick the closest one.',
      },
      {
        art: 'toggle',
        title: 'Turn on Developer mode',
        text: 'Scroll down to <b>Advanced settings</b> and switch on <b>[[term:devmode|Developer mode]]</b>.',
      },
      {
        art: 'paste',
        title: 'Create the connector',
        text: 'Back in <b>Apps &amp; Connectors</b>, click <b>Create</b>. Name: <b>NextTram</b>. In <b>[[term:mcp|MCP]] Server URL</b>, paste [[term:link|your link]]:',
        action: '[[copy:mcp]]',
      },
      {
        art: 'done',
        title: 'No sign-in, then Create',
        text: 'Authentication: <b>No authentication</b>. Tick <b>I trust this application</b> and click <b>Create</b>.',
      },
      {
        art: 'chat',
        title: 'Ask ChatGPT',
        text: 'In a new chat, click <b>+</b> → <b>More</b> → <b>Developer mode</b> and switch on <b>NextTram</b>. Ask <b>“When is the next tram?”</b>',
      },
    ],
  },
  {
    key: 'gemini',
    name: 'Gemini',
    where: 'Android phone',
    time: '1 minute',
    needs: 'An Android phone with Gemini or Google Assistant.',
    steps: [
      {
        art: 'install',
        title: 'Put NextTram on your home screen',
        text: 'In <b>Chrome</b>, tap <b>⋮</b> (top right) → <b>[[term:install|Install app]]</b>. Already on your home screen? Tap <b>Next</b>.',
      },
      {
        art: 'first',
        title: 'Check your first favorite',
        text: 'Google opens NextTram on your [[term:first|first favorite]]: [[first]].',
      },
      {
        art: 'speak',
        title: 'Ask Google',
        text: 'Say <b>“Hey Google, open NextTram”</b>. It opens straight away with your next tram.',
        tipLabel: 'Why only open the app?',
        tip: 'Gemini can’t read tram times from other apps aloud yet, so it opens the app for you instead.',
      },
    ],
  },
  {
    key: 'siri',
    name: 'Siri',
    where: 'iPhone, Apple Watch',
    time: '2 minutes',
    needs: 'An iPhone. Siri answers out loud, also on the Apple Watch, AirPods and in CarPlay.',
    steps: [
      {
        art: 'paste',
        title: 'Copy your link',
        text: 'It answers for your [[term:first|first favorite]]: [[first]].',
        action: '[[copy:siri]]',
      },
      {
        art: 'add',
        title: 'Make a new shortcut',
        text: 'Open the <b>[[term:shortcuts|Shortcuts]]</b> app and tap <b>+</b> (top right).',
      },
      {
        art: 'shortcut',
        title: 'Add “Get Contents of URL”',
        text: 'Tap <b>Add Action</b>, search <b>Get Contents of URL</b> and tap it. Tap the blue word <b>URL</b> and paste your link.',
      },
      {
        art: 'speaker',
        title: 'Add “Speak Text”',
        text: 'Search <b>Speak Text</b> at the bottom and tap it. It reads out what the link answers.',
      },
      {
        art: 'done',
        title: 'Name it',
        text: 'Tap the name at the top → <b>Rename</b> → <b>When is the next tram</b>. Tap <b>Done</b>.',
      },
      {
        art: 'speak',
        title: 'Ask Siri',
        text: 'Say <b>“Hey Siri, when is the next tram”</b>. Siri answers, for example: “Leave in 4 minutes, tram 7 from Edlichstraße.”',
        tipLabel: 'Way home too',
        tip: 'For the way home, make a second shortcut the same way with this link and call it <b>When is the tram home</b>: [[copy:siriBack]]',
      },
    ],
  },
  {
    key: 'alexa',
    name: 'Alexa',
    where: 'Echo, Alexa app',
    time: '2 minutes',
    needs: 'An Echo or the Alexa app, set to English or German.',
    steps: [
      {
        art: 'toggle',
        title: 'Turn on the skill',
        text: 'Open the NextTram [[term:skill|skill]] and tap <b>Enable</b>. Use the Amazon account your Echo uses.',
        action: go('https://www.amazon.de/dp/B0HQ7KN3S1/', 'Enable NextTram skill'),
        tipLabel: 'Other way',
        tip: 'Or in the <b>Alexa app</b>: <b>More</b> → <b>Skills &amp; Games</b> → search <b>NextTram</b> → <b>Enable to use</b>.',
      },
      {
        art: 'speak',
        title: 'Ask Alexa for your number',
        text: 'Say <b>“Alexa, open next tram”</b>. Alexa says a 2-digit [[term:number|number]].',
        tipLabel: 'Alexa said something else?',
        tip: 'German: <b>“Alexa, öffne next tram”</b>.<br>Alexa answers something else, like a question about your location? Then the skill is not on yet for that Amazon account or language. Check <b>More</b> → <b>Skills &amp; Games</b> → <b>Your Skills</b> in the Alexa app, then try again. The number also shows in the Alexa app under <b>More</b> → <b>Activity</b>.<br>Alexa tells you a tram instead? This Alexa is already connected. For a new number, say <b>“Alexa, ask next tram for a new code”</b>.',
      },
      {
        art: 'number',
        title: 'Type the number',
        text: 'Type the number here and tap <b>Connect</b>. It works for 5 minutes.',
        action: '[[copy:alexaPin]]',
      },
      {
        art: 'speak',
        title: 'Ask Alexa',
        text: 'Say <b>“Alexa, open next tram”</b>. Alexa now tells you the next tram for your [[term:first|first favorite]].',
        tipLabel: 'Shorter command',
        tip: 'To skip “open next tram” and just say <b>“Alexa, when is the next tram?”</b>, make a [[term:routine|routine]]: Alexa app → <b>More</b> → <b>Routines</b> → <b>+</b>. <b>When this happens</b> → <b>Voice</b> → <b>when is the next tram</b>. <b>Add action</b> → <b>Customized</b> → <b>open next tram</b>. <b>Save</b>.',
      },
    ],
  },
];
