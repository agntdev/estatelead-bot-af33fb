import { Composer } from "grammy";
import type { Ctx, LeadIntent } from "../bot.js";
import type { Lead } from "../leads.js";
import { leadStore } from "../leads.js";
import {
  adminChatId,
  inlineButton,
  inlineKeyboard,
  registerMainMenuItem,
} from "../toolkit/index.js";

registerMainMenuItem({ label: "Submit a lead", data: "lead:start", order: 10 });

const composer = new Composer<Ctx>();
const PHONE_PROMPT = "What is the best phone number to reach you? By sharing it, you agree the agent may contact you about your inquiry.";

/** A replaceable clock keeps time-sensitive lead behavior testable. */
export const leadClock = { now: (): number => Date.now() };

function now(): number { return leadClock.now(); }

function setStep(ctx: Ctx, step: NonNullable<Ctx["session"]["leadStep"]>): void {
  ctx.session.leadStep = step;
  ctx.session.leadExpiresAt = now() + 15 * 60 * 1000;
}

function clearDraft(ctx: Ctx): void {
  ctx.session.leadStep = undefined;
  ctx.session.leadExpiresAt = undefined;
  ctx.session.leadDraft = undefined;
}

function inputPrompt(placeholder: string) {
  return { reply_markup: { force_reply: true as const, input_field_placeholder: placeholder } };
}

function phonePrompt() {
  return {
    reply_markup: {
      keyboard: [[{ text: "Share phone number", request_contact: true }]],
      resize_keyboard: true,
      one_time_keyboard: true,
      input_field_placeholder: "Enter your phone number or share a contact",
    },
  };
}

function validPhone(phone: string): boolean {
  return /^\+?[0-9][0-9 ()-]{6,20}$/.test(phone);
}

composer.use(async (ctx, next) => {
  if (ctx.session.leadExpiresAt !== undefined && now() > ctx.session.leadExpiresAt) {
    clearDraft(ctx);
    await ctx.reply("Your lead form expired. Tap Submit a lead to start again.");
  }
  await next();
});

function leadSummary(draft: NonNullable<Ctx["session"]["leadDraft"]>): string {
  return `Review your lead:\n\nName: ${draft.name}\nPhone: ${draft.phone}\nInterest: ${draft.intent}\nNote: ${draft.note || "No note provided"}`;
}

function summaryKeyboard() {
  return inlineKeyboard([
    [inlineButton("Submit lead", "lead:submit")],
    [inlineButton("Edit name", "lead:edit:name"), inlineButton("Edit phone", "lead:edit:phone")],
    [inlineButton("Edit interest", "lead:edit:intent"), inlineButton("Edit note", "lead:edit:note")],
    [inlineButton("Cancel", "lead:cancel")],
  ]);
}

async function showSummary(ctx: Ctx, edit = false): Promise<void> {
  const draft = ctx.session.leadDraft;
  if (!draft) {
    await ctx.reply("Your lead form has expired. Tap Submit a lead to start again.");
    return;
  }
  setStep(ctx, "confirm");
  const options = { reply_markup: summaryKeyboard() };
  if (edit) await ctx.editMessageText(leadSummary(draft), options);
  else await ctx.reply(leadSummary(draft), options);
}

async function askIntent(ctx: Ctx, edit = false): Promise<void> {
  const options = {
    reply_markup: inlineKeyboard([
      [inlineButton("Buy a property", "lead:intent:Buying")],
      [inlineButton("Rent a property", "lead:intent:Renting")],
      [inlineButton("Sell a property", "lead:intent:Selling")],
      [inlineButton("Cancel", "lead:cancel")],
    ]),
  };
  if (edit) await ctx.editMessageText("What can the agent help you with?", options);
  else await ctx.reply("What can the agent help you with?", options);
}

composer.callbackQuery("lead:start", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.leadDraft = { name: "", phone: "", intent: "Buying", note: "" };
  setStep(ctx, "name");
  await ctx.reply("What is your name?", inputPrompt("Enter your name"));
});

composer.callbackQuery(/^lead:intent:(Buying|Renting|Selling)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const draft = ctx.session.leadDraft;
  if (!draft) {
    await ctx.reply("Your lead form has expired. Tap Submit a lead to start again.");
    return;
  }
  draft.intent = ctx.match[1] as LeadIntent;
  setStep(ctx, "note");
  await ctx.editMessageText("Add a short note, or tap Skip note.", {
    reply_markup: inlineKeyboard([[inlineButton("Skip note", "lead:note:skip"), inlineButton("Cancel", "lead:cancel")]]),
  });
  await ctx.reply("What details would you like to share?", inputPrompt("Budget, area, timing, or other details"));
});

composer.callbackQuery("lead:note:skip", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!ctx.session.leadDraft) {
    await ctx.reply("Your lead form has expired. Tap Submit a lead to start again.");
    return;
  }
  ctx.session.leadDraft.note = "";
  await showSummary(ctx, true);
});

composer.callbackQuery(/^lead:edit:(name|phone|intent|note)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!ctx.session.leadDraft) {
    await ctx.reply("Your lead form has expired. Tap Submit a lead to start again.");
    return;
  }
  const field = ctx.match[1] as "name" | "phone" | "intent" | "note";
  if (field === "intent") {
    await askIntent(ctx, true);
    return;
  }
  setStep(ctx, field);
  const prompts = {
    name: ["What is your name?", "Enter your name"],
    phone: [PHONE_PROMPT, "Enter your phone number"],
    note: ["What details would you like to share?", "Budget, area, timing, or other details"],
  } as const;
  const [text, placeholder] = prompts[field];
  await ctx.reply(text, field === "phone" ? phonePrompt() : inputPrompt(placeholder));
});

composer.callbackQuery("lead:cancel", async (ctx) => {
  await ctx.answerCallbackQuery();
  clearDraft(ctx);
  await ctx.editMessageText("Your lead form was cancelled.");
});

composer.on("message:contact", async (ctx, next) => {
  if (ctx.session.leadStep !== "phone" || !ctx.session.leadDraft) return next();
  const phone = ctx.message.contact.phone_number.trim();
  if (!validPhone(phone)) {
    await ctx.reply("That phone number does not look valid. Enter it with at least seven digits.");
    return;
  }
  ctx.session.leadDraft.phone = phone;
  await askIntent(ctx);
});

composer.on("message:text", async (ctx, next) => {
  const step = ctx.session.leadStep;
  const draft = ctx.session.leadDraft;
  if (!step || !draft || step === "confirm") return next();
  const value = ctx.message.text.trim();
  if (!value) {
    await ctx.reply("Add a short response so we can continue.");
    return;
  }
  if (step === "name") {
    if (value.length < 2 || value.length > 80) {
      await ctx.reply("Enter your full name, using 2 to 80 characters.");
      return;
    }
    draft.name = value;
    setStep(ctx, "phone");
    await ctx.reply(PHONE_PROMPT, phonePrompt());
    return;
  }
  if (step === "phone") {
    if (!validPhone(value)) {
      await ctx.reply("That phone number does not look valid. Enter it with at least seven digits.");
      return;
    }
    draft.phone = value;
    await askIntent(ctx);
    return;
  }
  if (step === "note") {
    if (value.length > 600) {
      await ctx.reply("Keep the note under 600 characters.");
      return;
    }
    draft.note = value;
    await showSummary(ctx);
    return;
  }
  return next();
});

composer.callbackQuery("lead:submit", async (ctx) => {
  await ctx.answerCallbackQuery();
  const draft = ctx.session.leadDraft;
  if (!draft || ctx.session.leadStep !== "confirm") {
    await ctx.reply("Your lead form has expired. Tap Submit a lead to start again.");
    return;
  }
  const store = leadStore(ctx);
  if (!store) {
    await ctx.reply("Lead storage is not available yet. Please try again shortly.");
    return;
  }
  const lead: Lead = {
    id: crypto.randomUUID(),
    ...draft,
    status: "New",
    created_at: now(),
  };
  try {
    await store.create(lead);
  } catch {
    await ctx.reply("We could not save your lead. Please try again shortly.");
    return;
  }
  clearDraft(ctx);
  await ctx.editMessageText("Your lead has been sent. The agent will be in touch.");

  const owner = adminChatId(ctx as unknown as { env?: Record<string, unknown> | null });
  if (!owner) return;
  try {
    await ctx.api.sendMessage(owner, `New lead received:\n\nName: ${lead.name}\nPhone: ${lead.phone}\nInterest: ${lead.intent}\nNote: ${lead.note || "No note provided"}`, {
      reply_markup: inlineKeyboard([[inlineButton("View lead", `lead:view:${lead.id}`)]]),
    });
  } catch {
    // A blocked or unavailable owner chat must not undo a saved lead.
  }
});

export default composer;
