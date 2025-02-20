const OPENROUTER_API_KEY = 'YOUR_OPENROUT'
const SITE_URL = 'https://naufal.hardiansyah.me';
const SITE_NAME = 'Naufal hardiansyah';
const MAX_ATTEMPT = 5;

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const cliProgress = require('cli-progress');

// Workaround for bundling puppeteer
// https://github.com/vercel/pkg/issues/204#issuecomment-1477778921
const puppeteer = require('puppeteer');
const path = require("path");
const { PUPPETEER_REVISIONS } = require("puppeteer-core/internal/revisions.js");
const browserFetcher = puppeteer.createBrowserFetcher();
const revisionInfo = browserFetcher.revisionInfo(PUPPETEER_REVISIONS.chromium);
let executablePath = revisionInfo.executablePath;
if ((process)["pkg"] !== undefined) {
  executablePath = path.join(path.dirname(process.execPath), "puppeteer", revisionInfo.executablePath.substring(revisionInfo.folderPath.length));
}
//throw new Error(`Puppeteer executable path is ${executablePath}`);
// console.log("Puppeteer executable path", executablePath);
// End of workaround

const today = new Date();
const client = new Client({
  authStrategy: new LocalAuth(),
    puppeteer: {
    executablePath: executablePath,
    headless: true, // or false if you need to see the browser window
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  }
});

client.on('qr', (qr) => {
  qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
  console.log('Client ready, retrieving chats...');
  const chats = await client.getChats();
  console.log(chats.length, 'chats found.');
  const filteredChats = chats.filter((chat) => chat.id._serialized !== client.info.wid._serialized);
  const progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
  progressBar.start(filteredChats.length, 0);
  let compiledSummary = `*WhatsApp Groups Summary*\n\n`;
  const me = await client.getContactById(client.info.wid._serialized);
  const myName = me.pushname || me.verifiedName || 'Me';
  const groupTranscripts = [];
  let chatsWithActivity = new Set();
  for (let i = 0; i < filteredChats.length; i++) {
    const chat = filteredChats[i];
    try {
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      let lastMessageId = null;
      let fetchMore = true;
      let limit = 50;
      let hasActivity = false;
      let todaysMessages = new Set();
      while (fetchMore) {
        const fetchedMessages = await chat.fetchMessages({ limit: limit });        
        if (fetchedMessages.length === 0) break;
        const fetchedLastMessageId = fetchedMessages[0]?.id?.id || null;
        if (fetchedLastMessageId === lastMessageId) {
          fetchMore = true
          limit += 50;
          continue;
        }
        
        lastMessageId = fetchedLastMessageId;        
        for (const msg of fetchedMessages) {
          const msgDate = new Date(msg.timestamp * 1000);
          if (msgDate >= today && msgDate < tomorrow) {
            hasActivity = true;
            todaysMessages.add(msg);
          } else if (msgDate < today) {
            fetchMore = false;
          }
        }

        // let lastMessageBody = fetchedMessages[0].body;
        // let lastMessageDate = new Date(fetchedMessages[0].timestamp * 1000);
        if (fetchedMessages.length < limit) fetchMore = false;
        if (hasActivity) chatsWithActivity.add(chat);
        if (fetchMore) {
          let test = 1;
        }
      }
      const conversation = await Promise.all(
        Array.from(todaysMessages).map(async (msg) => {
          const contact = await msg.getContact();
          const sender = msg.fromMe ? myName : (contact.pushname || msg.author || msg.from);
          let messageBody = msg.hasMedia ? '[Media]' : msg.body;
          if (msg.mentionedIds.length > 0) {
            for (const mentionedId of msg.mentionedIds) {
              const mentionedContact = await client.getContactById(mentionedId._serialized);
              const mentionedName = mentionedContact.pushname || mentionedContact.verifiedName || mentionedId.user;
              messageBody = messageBody.replace(`@${mentionedId.user}`, `@${mentionedName}`);
            }
          }
          return `${sender}: ${messageBody}`;
        })
      );

      if (chatsWithActivity.has(chat)) {
        groupTranscripts.push({
          group: chat.name,
          transcript: conversation.join('\n')
        });
      }
    } catch (error) {
      console.error(`Error processing group "${chat.name}":`, error);
      groupTranscripts.push({
        group: chat.name,
        transcript: '_Error processing chat_'
      });
    }
    progressBar.update(i + 1);
  }
  progressBar.stop();
  let aggregatedTranscripts = "";
  for (const entry of groupTranscripts) {
    aggregatedTranscripts += `Conversation name: ${entry.group}\n`;
    aggregatedTranscripts += `${entry.transcript}\n\n------------------------------\n\n`;
  }

  let aggregatedSummary = "";
  console.log(`Generating summary of ${groupTranscripts.length} conversations..`)
  for (let attempt = 1; attempt <= MAX_ATTEMPT; attempt++) {
    try {
      const prompt = `Please provide a summary for every chat in the following WhatsApp chat conversations in brief and concise. 
      Make key points of every conversations. Blank messages may indicate deleted content. 
      For context, "${myName}" refers to the user of this script. 
      IMPORTANT: Your response should folow the formatting rules below
      *{Conversation Name}:*
      {Key points of the conversation in bullet points 
      (e.g. 
        - point 1
        - point 2)}

      Use the following formatting rules for your response when needed:
      - Italic: To italicize your message, place an underscore on both sides of the text: _text_
      - Bold: To bold your message, place an asterisk on both sides of the text: *text*
      - Strikethrough: To strikethrough your message, place a tilde on both sides of the text: ~text~
      - Monospace: To monospace your message, place three backticks on both sides of the text: \`\`\`text\`\`\`
      - Bulleted list: To add a bulleted list to your message, place an asterisk or hyphen and a space before each word or sentence:
        * text
        * text
        Or
        - text
        - text
      - Numbered list: To add a numbered list to your message, place a number, period, and space before each line of text:
        1. text
        2. text
      - Quote: To add a quote to your message, place an angle bracket and space before the text: > text
      - Inline code: To add inline code to your message, place a backtick on both sides of the message: \`text\` 
      IMPORTANT: Do not use double ** or __ for bold or italic formatting. Only use single * or _ for formatting.

      Conversations as follows: \n\n${aggregatedTranscripts}`;
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          'HTTP-Referer': SITE_URL,
          'X-Title': SITE_NAME,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'deepseek/deepseek-r1:free',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.6,
          include_reasoning: true,
        }),
      });
      if (!res.ok) {
        throw new Error(`API error: ${res.statusText}`);
      }
      const data = await res.json();
      aggregatedSummary = data.choices?.[0]?.message?.content.trim();
      if (aggregatedSummary) {
        // console.log("Reasoning:", data.choices?.[0]?.message?.reasoning.trim());
        // console.log('Aggregated summary generated successfully:', aggregatedSummary);
        break;
      }
    } catch (error) {
      console.error(`Attempt ${attempt} failed for aggregated summary: ${error.message}`);
    } finally {
      if (attempt < MAX_ATTEMPT) {
        console.log(`Retrying attempt ${attempt + 1} to summarize...`);
      }
    }
  }
  compiledSummary = aggregatedSummary || '_No summary available_';
  const todayFormatted = today.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const chatList = Array.from(chatsWithActivity)
    .map((chat) => `• ${chat.name}`);
    
  const awaitingResponseList = Array.from(chatsWithActivity)
    .filter((chat) => !chat.lastMessage.fromMe)
    .map((chat) => `• ${chat.name}`);

  console.log(chatList.length, 'Today`s chat with activity found.');
  const summaryMessage = `*WhatsApp Summary for ${todayFormatted}*
    \n${compiledSummary}
    \n*Today's Chats with Activity (${chatList.length}):*\n${chatList.join('\n') || '_None_'}
    \n*Awaiting for response (${awaitingResponseList.length}):*\n${awaitingResponseList.join('\n') || '_None_'}`;
  await client.sendMessage(client.info.wid._serialized, summaryMessage);
  console.log('Summary sent to self.');
  console.log('Done!');
});

client.initialize();
