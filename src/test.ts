export class ChatGPTBot {
  // ... 其他成员和方法 ...

  private greetingTimers = new Map<string, NodeJS.Timeout>();

  async onMessage(talker: ContactInterface, text: RoomInterface) {
    const isPrivateChat = !room; // 假设room是全局变量或者可以确定上下文的变量
    const messageContext = isPrivateChat ? "private" : "group";

    if (this.shouldGreet(talker, messageContext)) {
      await this.handleGreeting(talker, messageContext, text);
    }

    // ... 其他消息处理 ...
  }

  private async handleGreeting(
    talker: ContactInterface,
    context: "private" | "group",
    text: string
  ) {
    const talkerName = talker.name();
    if (this.greetingTimers.has(talkerName)) {
      // 如果已经有一个定时器在运行，就不设置新的定时器
      return;
    }

    // 延迟时间设置为1到2秒之间的随机数
    const delay = this.getRandomInt(1 * 1000, 2 * 1000);
    const timer = setTimeout(() => {
      this.sendGreeting(talker, context);
      this.greetingTimers.delete(talkerName);
    }, delay);

    this.greetingTimers.set(talkerName, timer);

    if (context === "private") {
      await this.onPrivateMessage(talker, text);
    } else if (context === "group") {
      await this.onGroupMessage(talker, text, room);
    }
  }

  private shouldGreet(
    talker: ContactInterface,
    context: "private" | "group"
  ): boolean {
    // 这里可以定义何时应该向用户发送问候消息的逻辑
    // 可以根据context来决定不同的触发条件
    // ...
    return true; // 假设总是返回true，实际逻辑需要根据需求来实现
  }

  private getRandomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private sendGreeting(talker: ContactInterface, context: "private" | "group") {
    // 根据上下文发送问候消息
    let greetingMessage = `Hello, ${talker.name()}!`;
    if (context === "group") {
      greetingMessage += " This is a group message.";
    } else {
      greetingMessage += " This is a private message.";
    }
    this.sendMessage(talker, greetingMessage);
  }

  private sendMessage(talker: ContactInterface, message: string) {
    // 根据talker的类型发送消息
    if (talker instanceof RoomImpl) {
      // 群聊消息发送逻辑
    } else {
      // 私聊消息发送逻辑
      talker.say(message);
    }
  }

  // ... 其他成员和方法 ...
}
