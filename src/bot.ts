import { config } from "./config.js";
import {
  ContactImpl,
  ContactInterface,
  RoomImpl,
  RoomInterface,
} from "wechaty/impls";
import { Message } from "wechaty";
import { FileBox } from "file-box";
import { chatgpt, dalle, whisper } from "./openai.js";
import DBUtils from "./data.js";
import { regexpEncode } from "./utils.js";
import * as fs from "fs/promises";
import { stringify } from "uuid";

enum MessageType {
  Unknown = 0,
  Attachment = 1, // Attach(6),
  Audio = 2, // Audio(1), Voice(34)
  Contact = 3, // ShareCard(42)
  ChatHistory = 4, // ChatHistory(19)
  Emoticon = 5, // Sticker: Emoticon(15), Emoticon(47)
  Image = 6, // Img(2), Image(3)
  Text = 7, // Text(1)
  Location = 8, // Location(48)
  MiniProgram = 9, // MiniProgram(33)
  GroupNote = 10, // GroupNote(53)
  Transfer = 11, // Transfers(2000)
  RedEnvelope = 12, // RedEnvelopes(2001)
  Recalled = 13, // Recalled(10002)
  Url = 14, // Url(5)
  Video = 15, // Video(4), Video(43)
  Post = 16, // Moment, Channel, Tweet, etc
}
const SINGLE_MESSAGE_MAX_SIZE = 500;
type Speaker = RoomImpl | ContactImpl;
interface ICommand {
  name: string;
  description: string;
  exec: (talker: Speaker, text: string) => Promise<void>;
}
interface element {
  name: string;
  info: string;
  prompt: string;
}

export class ChatGPTBot {
  private greetingTimers = new Map<string, NodeJS.Timeout>();

  private sendGreeting(talker: ContactInterface) {
    // 发送问候消息的逻辑
    this.onPrivateMessage(talker, "随便向我说我点什么");
  }

  chatPrivateTriggerKeyword = config.chatPrivateTriggerKeyword;
  chatTriggerRule = config.chatTriggerRule
    ? new RegExp(config.chatTriggerRule)
    : undefined;
  disableGroupMessage = config.disableGroupMessage || false;
  botName: string = "";
  ready = false;
  setBotName(botName: string) {
    this.botName = botName;
  }
  get chatGroupTriggerRegEx(): RegExp {
    return new RegExp(`^@${regexpEncode(this.botName)}\\s`);
  }
  get chatPrivateTriggerRule(): RegExp | undefined {
    const { chatPrivateTriggerKeyword, chatTriggerRule } = this;
    let regEx = chatTriggerRule;
    if (!regEx && chatPrivateTriggerKeyword) {
      regEx = new RegExp(regexpEncode(chatPrivateTriggerKeyword));
    }
    return regEx;
  }
  private readonly commands: ICommand[] = [
    {
      name: "list",
      description: "显示帮助信息",
      exec: async (talker) => {
        await this.trySay(
          talker,
          "========\n" +
            "可用命令，请在前面加上/command \n" +
            "help\n" +
            "prompt <PROMPT>\n" +
            "image <PROMPT>\n" +
            "clear\n" +
            "greeting\n" +
            "persona (实用性存疑，搁置)\n" +
            "========"
        );
      },
    },
    {
      name: "prompt",
      description: "设置当前会话的prompt",
      exec: async (talker, prompt) => {
        if (talker instanceof RoomImpl) {
          DBUtils.setPrompt(await talker.topic(), prompt);
        } else {
          DBUtils.setPrompt(talker.name(), prompt);
        }
      },
    },
    {
      name: "greeting",
      description: "设置当前对话是否允许BOT时不时主动发消息",
      exec: async (talker: Speaker, trueOrFalse: string) => {
        if (trueOrFalse == "1" || trueOrFalse == "true") {
          await talker.say("好哒，谢谢主人允许我打扰您，嘿嘿~\n");
          // this.startRandomLoggingTimer(talker);
        } else {
          // this.stopRandomLoggingTimer();
          await talker.say("好哒，我会安静地不打扰主人~\n");
        }
      },
    },
    {
      name: "clear",
      description: "清除自上次启动以来的所有会话",
      exec: async (talker) => {
        if (talker instanceof RoomImpl) {
          DBUtils.clearHistory(await talker.topic());
        } else {
          DBUtils.clearHistory(talker.name());
        }
      },
    },
    {
      name: "persona",
      description: "",
      exec: async (talker, personaIndex: string) => {
        try {
          const data = await fs.readFile("./src/persona.json", "utf8");
          const jsonData = JSON.parse(data);
          let resArr = "";

          jsonData.forEach((element: element, index: number) => {
            resArr += `${index} - ${JSON.stringify(
              element.name
            )} : ${JSON.stringify(element.info)}\n\n`;
          });

          let tempIndex =
            typeof personaIndex == "string"
              ? personaIndex
              : parseInt(personaIndex);
          if (jsonData[tempIndex]) {
            (await talker.say("有这个性格噢: " + jsonData[tempIndex].name)) +
              "在这个性格下，我会...：\n" +
              jsonData[tempIndex].info;
            await talker.say(
              "但是主人还没有做完这部分的功能，再等等吧，嘿嘿。"
            );
          } else {
            await talker.say(
              "command persona [序号] 可以操作我的人格 \n" + resArr
            );
          }
        } catch (error) {
          // 处理可能发生的错误
          await talker.say(`Error reading persona.json: ${error}`);
        }
      },
    },
  ];

  /**
   * EXAMPLE:
   *       /cmd help
   *       /cmd prompt <PROMPT>
   *       /cmd img <PROMPT>
   *       /cmd clear
   * @param contact
   * @param rawText
   */
  async command(contact: any, rawText: string): Promise<void> {
    const [commandName, ...args] = rawText.split(/\s+/);
    const command = this.commands.find(
      (command) => command.name === commandName
    );
    if (command) {
      await command.exec(contact, args.join(" "));
    }
  }
  // remove more times conversation and mention
  cleanMessage(rawText: string, privateChat: boolean = false): string {
    let text = rawText;
    const item = rawText.split("- - - - - - - - - - - - - - -");
    if (item.length > 1) {
      text = item[item.length - 1];
    }

    const { chatTriggerRule, chatPrivateTriggerRule } = this;

    if (privateChat && chatPrivateTriggerRule) {
      text = text.replace(chatPrivateTriggerRule, "");
    } else if (!privateChat) {
      text = text.replace(this.chatGroupTriggerRegEx, "");
      text = chatTriggerRule ? text.replace(chatTriggerRule, "") : text;
    }
    // remove more text via - - - - - - - - - - - - - - -
    return text;
  }
  async getGPTMessage(talkerName: string, text: string): Promise<string> {
    let gptMessage = await chatgpt(talkerName, text);
    if (gptMessage !== "") {
      DBUtils.addAssistantMessage(talkerName, gptMessage);
      return gptMessage;
    }
    return "Sorry, please try again later. 😔";
  }
  // Check if the message returned by chatgpt contains masked words]
  checkChatGPTBlockWords(message: string): boolean {
    if (config.chatgptBlockWords.length == 0) {
      return false;
    }
    return config.chatgptBlockWords.some((word) => message.includes(word));
  }
  // The message is segmented according to its size
  async trySay(
    talker: RoomInterface | ContactInterface,
    mesasge: string
  ): Promise<void> {
    const messages: Array<string> = [];
    if (this.checkChatGPTBlockWords(mesasge)) {
      console.log(`🚫 Blocked ChatGPT: ${mesasge}`);
      return;
    }
    let message = mesasge;
    while (message.length > SINGLE_MESSAGE_MAX_SIZE) {
      messages.push(message.slice(0, SINGLE_MESSAGE_MAX_SIZE));
      message = message.slice(SINGLE_MESSAGE_MAX_SIZE);
    }
    messages.push(message);
    for (const msg of messages) {
      await talker.say(msg);
    }
  }
  // Check whether the ChatGPT processing can be triggered
  triggerGPTMessage(text: string, privateChat: boolean = false): boolean {
    const { chatTriggerRule } = this;
    let triggered = false;
    if (privateChat) {
      const regEx = this.chatPrivateTriggerRule;
      triggered = regEx ? regEx.test(text) : true;
    } else {
      triggered = this.chatGroupTriggerRegEx.test(text);
      // group message support `chatTriggerRule`
      if (triggered && chatTriggerRule) {
        triggered = chatTriggerRule.test(
          text.replace(this.chatGroupTriggerRegEx, "")
        );
      }
    }
    if (triggered) {
      console.log(`🎯 Triggered ChatGPT: ${text}`);
    }
    return triggered;
  }
  // Check whether the message contains the blocked words. if so, the message will be ignored. if so, return true
  checkBlockWords(message: string): boolean {
    if (config.blockWords.length == 0) {
      return false;
    }
    return config.blockWords.some((word) => message.includes(word));
  }
  // Filter out the message that does not need to be processed
  isNonsense(
    talker: ContactInterface,
    messageType: MessageType,
    text: string
  ): boolean {
    return (
      talker.self() ||
      // TODO: add doc support
      !(messageType == MessageType.Text || messageType == MessageType.Audio) ||
      talker.name() === "微信团队" ||
      // 语音(视频)消息
      text.includes("收到一条视频/语音聊天消息，请在手机上查看") ||
      // 红包消息
      text.includes("收到红包，请在手机上查看") ||
      // Transfer message
      text.includes("收到转账，请在手机上查看") ||
      // 位置消息
      text.includes("/cgi-bin/mmwebwx-bin/webwxgetpubliclinkimg") ||
      // 聊天屏蔽词
      this.checkBlockWords(text)
    );
  }

  getRandomInt(min: number, max: number) {
    // 确保最小值和最大值是整数
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  async onPrivateMessage(talker: ContactInterface, text: string) {
    const gptMessage = await this.getGPTMessage(talker.name(), text);
    await this.trySay(talker, gptMessage);
  }

  async onGroupMessage(
    talker: ContactInterface,
    text: string,
    room: RoomInterface
  ) {
    const gptMessage = await this.getGPTMessage(await room.topic(), text);
    // 更改群聊信息的回复格式
    const result = `@${talker.name()}\n------\n ${gptMessage}`;
    // const result = `@${talker.name()} ${gptMessage}`;
    await this.trySay(room, result);
  }

  async setHello(
    talker: ContactInterface,
    privateOrGroup: string,
    room?: RoomInterface
  ) {
    // 未来可以加个Date来把时间告诉bot
    const sayHiPrompt = "请向我打个招呼，分享你正在想什么，并且正在做什么。";
    // 使用talker的name属性作为Map的键进行检查
    const talkerName = talker.name();
    if (room) {
      console.log(room.id);
    }
    if (room && this.greetingTimers.has(room.id)) {
      // 如果已经有一个定时器在运行，就不设置新的定时器
      return;
    } else if (this.greetingTimers.has(talkerName)) {
      return;
    }

    // 设置一个新的定时器，并使用talker的name属性作为Map的键来存储
    const timer = setTimeout(async () => {
      if (privateOrGroup == "private") {
        await this.onPrivateMessage(talker, sayHiPrompt);
        return this.greetingTimers.delete(talker.name()); // 使用talker的name属性作为键来删除
      } else if (privateOrGroup == "group" && room) {
        await this.onGroupMessage(talker, sayHiPrompt, room);
        return this.greetingTimers.delete(room.id); // 使用talker的name属性作为键来删除
      }
    }, this.getRandomInt(10 * 1000, 11 * 1000)); // 随机1-2后主动打招呼

    if (room) {
      // 存储定时器引用
      this.greetingTimers.set(room.id, timer);
    } else {
      // 存储定时器引用
      this.greetingTimers.set(talkerName, timer);
    }
  }

  async onMessage(message: Message) {
    const talker = message.talker();
    const rawText = message.text();
    const room = message.room();
    const messageType = message.type();
    const privateChat = !room;
    if (privateChat) {
      console.log(`🤵 Contact: ${talker.name()} 💬 Text: ${rawText}`);
    } else {
      const topic = await room.topic();
      console.log(
        `🚪 Room: ${topic} 🤵 Contact: ${talker.name()} 💬 Text: ${rawText}`
      );
    }
    if (this.isNonsense(talker, messageType, rawText)) {
      return;
    }
    if (messageType == MessageType.Audio) {
      // 保存语音文件
      const fileBox = await message.toFileBox();
      let fileName = "./public/" + fileBox.name;
      await fileBox.toFile(fileName, true).catch((e) => {
        console.log("保存语音失败", e);
        return;
      });
      // Whisper
      whisper("", fileName).then((text) => {
        message.say(text);
      });
      return;
    }
    if (rawText.startsWith("/command ")) {
      console.log(`🤖 Command: ${rawText}`);
      const cmdContent = rawText.slice(9); // 「/cmd 」一共5个字符(注意空格)
      if (privateChat) {
        await this.command(talker, cmdContent);
      } else {
        await this.command(room, cmdContent);
      }
      return;
    }
    // 使用DallE生成图片
    if (rawText.startsWith("/image")) {
      console.log(`🤖 Image: ${rawText}`);
      const imgContent = rawText.slice(6);
      if (privateChat) {
        let url = (await dalle(talker.name(), imgContent)) as string;
        const fileBox = FileBox.fromUrl(url);
        message.say(fileBox);
      } else {
        let url = (await dalle(await room.topic(), imgContent)) as string;
        const fileBox = FileBox.fromUrl(url);
        message.say(fileBox);
      }
      return;
    }
    // 立刻让GPT回复的时候，如果没有旧计时器也增加一个计时器
    // 下次就会在这个对话里主动发消息
    if (this.triggerGPTMessage(rawText, privateChat)) {
      const text = this.cleanMessage(rawText, privateChat);
      if (privateChat) {
        this.setHello(talker, "private");
        return await this.onPrivateMessage(talker, text);
      } else {
        if (!this.disableGroupMessage) {
          this.setHello(talker, "group", room);
          return await this.onGroupMessage(talker, text, room);
        } else {
          return;
        }
      }
    } else {
      return;
    }
  }
}
