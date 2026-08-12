import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { openLeadInbox } from "./admin.js";
import { inlineButton, inlineKeyboard, isOwner, mainMenuKeyboard, requireOwner, type OwnerAwareCtx } from "../toolkit/index.js";

// The /start handler renders the bot's MAIN MENU — the primary way users operate
// a button-first bot. A feature adds its own button by calling
// `registerMainMenuItem(...)` in its own `src/handlers/<slug>.ts`; this handler
// renders whatever is registered (plus a Help button), so you do NOT edit this
// file to add a feature. Send ONE message — no placeholder line above the menu.
const composer = new Composer<Ctx>();

const WELCOME = "Share your property plans and an agent will contact you. Tap 'Submit request' to begin.";

function welcomeKeyboard(ctx: Ctx) {
  const menu = mainMenuKeyboard();
  if (!isOwner(ctx)) return menu;
  return inlineKeyboard([...menu.inline_keyboard, [inlineButton("View leads", "view_leads")]]);
}

composer.command("start", async (ctx) => {
  await ctx.reply(WELCOME, { reply_markup: welcomeKeyboard(ctx) });
});

// "Back to menu" — re-render the main menu in place from any sub-view.
composer.callbackQuery("menu:main", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(WELCOME, { reply_markup: welcomeKeyboard(ctx) });
});

// This callback is intentionally not a public menu item: it is appended only
// when the platform-injected owner identity matches the user opening /start.
composer.callbackQuery("view_leads", async (ctx) => {
  if (!(await requireOwner(ctx as unknown as OwnerAwareCtx))) return;
  await ctx.answerCallbackQuery();
  await openLeadInbox(ctx, 0, true);
});

export default composer;
