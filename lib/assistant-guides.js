/**
 * The "Add NextTram to your assistant" guides shown behind the AI button.
 *
 * Step text is HTML with two kinds of placeholders, filled in by app.js:
 *   [[term:key|shown words]]  a word with a small (i); tapping it shows TERMS[key]
 *   [[copy:key]]              a box with something to copy (the user's link, the Alexa voice model, …)
 * Keep the language plain: short sentences, exact button names in bold, one action per step.
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

export const ASSISTANTS = [
  {
    key: 'claude',
    name: 'Claude',
    where: 'Phone, computer',
    time: 'About 2 minutes',
    needs: 'A Claude account (the free one works). Do it once in a web browser, then it also works in the Claude app.',
    steps: [
      'Open <b>claude.ai</b> in a web browser and sign in. <a class="go-link" href="https://claude.ai" target="_blank" rel="noopener">Open Claude</a>',
      'In the menu on the left, open <b>Customize → Connectors</b>. Tap <b>+</b> and choose <b>Add custom [[term:connector|connector]]</b>.',
      'In <b>Name</b>, type <b>NextTram</b>.',
      'In <b>Remote [[term:mcp|MCP]] server URL</b>, paste [[term:link|your link]]: [[copy:mcp]]',
      'Claude may say it <b>couldn’t check the server</b>. That’s fine: NextTram needs no sign-in, your link is the key. Tap <b>Continue anyway</b> and pick no sign-in if it asks.',
      'Tap <b>Add</b>. NextTram now shows in your list of connectors.',
      'Start a new chat and ask: <b>“When is the next tram?”</b> The first time, Claude asks if it may use NextTram. Tap <b>Always allow</b>.',
    ],
    tryIt: 'When is the next tram?',
  },
  {
    key: 'chatgpt',
    name: 'ChatGPT',
    where: 'Computer',
    time: 'About 3 minutes',
    needs: 'A paid ChatGPT plan (Plus or higher) and a computer with a web browser. ChatGPT renames its menus now and then; if a name differs, pick the closest one.',
    steps: [
      'Open <b>chatgpt.com</b> on a computer and sign in. Click your name (bottom left) → <b>Settings</b> → <b>Apps &amp; Connectors</b>. <a class="go-link" href="https://chatgpt.com/#settings/Connectors" target="_blank" rel="noopener">Open ChatGPT settings</a>',
      'Scroll down to <b>Advanced settings</b> and switch on <b>[[term:devmode|Developer mode]]</b>.',
      'Go back to <b>Apps &amp; Connectors</b> and click <b>Create</b> (top right). This makes a new [[term:connector|connector]] for NextTram.',
      'In <b>Name</b>, type <b>NextTram</b>. In <b>[[term:mcp|MCP]] Server URL</b>, paste [[term:link|your link]]: [[copy:mcp]]',
      'Under <b>Authentication</b>, choose <b>No authentication</b>. Tick <b>I trust this application</b> and click <b>Create</b>.',
      'Start a new chat. Click <b>+</b> next to the message box → <b>More</b> → <b>Developer mode</b>, and switch on <b>NextTram</b>. Then ask: <b>“When is the next tram?”</b>',
    ],
    tryIt: 'When is the next tram?',
  },
  {
    key: 'gemini',
    name: 'Gemini',
    where: 'Android phone',
    time: 'About 1 minute',
    needs: 'An Android phone with Gemini or Google Assistant. Gemini opens NextTram for you and you see your next tram with the countdown. (Gemini can’t read tram times from other apps aloud yet.)',
    steps: [
      'Open this page in <b>Chrome</b> on your Android phone.',
      'Tap the <b>⋮</b> menu (top right) → <b>[[term:install|Install app]]</b> (or <b>Add to Home screen</b> → <b>Install</b>). If NextTram is already on your home screen, skip this.',
      'Check that the trip you want is your [[term:first|first favorite]].',
      'Say <b>“Hey Google, open NextTram”</b>. NextTram opens straight away with your next tram.',
    ],
    tryIt: 'Hey Google, open NextTram',
  },
  {
    key: 'siri',
    name: 'Siri',
    where: 'iPhone, Apple Watch',
    time: 'About 2 minutes',
    needs: 'An iPhone. Siri says your next tram out loud, also from the Apple Watch, AirPods and in CarPlay.',
    steps: [
      'Copy [[term:link|your link]]. It answers for your [[term:first|first favorite]]: [[copy:siri]]',
      'Open the <b>[[term:shortcuts|Shortcuts]]</b> app and tap <b>+</b> (top right).',
      'Tap <b>Add Action</b>, type <b>Get Contents of URL</b> in the search box, and tap it. Tap the blue word <b>URL</b> and paste your link.',
      'Tap the search box at the bottom, type <b>Speak Text</b>, and tap it. It reads out what the link answers.',
      'Tap the name at the top → <b>Rename</b> → type <b>When is the next tram</b>. Tap <b>Done</b>.',
      'Say <b>“Hey Siri, when is the next tram”</b>. Siri answers, for example: “Leave in 4 minutes, tram 7 from Edlichstraße.”',
      'Optional: for the way home, make a second shortcut the same way with this link and call it <b>When is the tram home</b>: [[copy:siriBack]]',
    ],
    tryIt: 'Hey Siri, when is the next tram',
  },
  {
    key: 'alexa',
    name: 'Alexa',
    where: 'Echo, Alexa app',
    time: 'About 2 minutes',
    needs: 'An Echo or the Alexa app, set to English or German.',
    steps: [
      'In the <b>Alexa app</b>, tap <b>More</b> → <b>Skills &amp; Games</b>, search for <b>Next Tram</b> and tap <b>Enable to use</b>. This turns on the NextTram [[term:skill|skill]].',
      'Say <b>“Alexa, ask next tram to pair”</b> (German: <b>“Alexa, frag next tram nach dem Code”</b>). Alexa says a 2-digit [[term:number|number]].',
      'Type the number here and tap <b>Connect</b>: [[copy:alexaPin]]',
      'Done. Alexa now answers for your [[term:first|first favorite]]. (Steps 2 and 3 are optional: without them Alexa uses the built-in stops.)',
      'Optional: to just say <b>“Alexa, when is the next tram?”</b>, make a [[term:routine|routine]]. In the Alexa app tap <b>More</b> → <b>Routines</b> → <b>+</b>. <b>When this happens</b> → <b>Voice</b> → type <b>when is the next tram</b>. <b>Add action</b> → <b>Customized</b> → type <b>ask next tram when is the next tram</b>. Tap <b>Save</b>.',
    ],
    tryIt: 'Alexa, ask next tram when is the next tram',
  },
];
