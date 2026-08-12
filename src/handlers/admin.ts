import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import type { Lead, LeadStatus } from "../leads.js";
import { leadStore } from "../leads.js";
import { inlineButton, inlineKeyboard, paginate, requireOwner, type OwnerAwareCtx, type InlineButton } from "../toolkit/index.js";

const composer = new Composer<Ctx>();
const PAGE_SIZE = 5;

function detailText(lead: Lead): string {
  return `Lead details\n\nName: ${lead.name}\nPhone: ${lead.phone}\nInterest: ${lead.intent}\nNote: ${lead.note || "No note provided"}\nStatus: ${lead.status}`;
}

function detailKeyboard(lead: Lead) {
  const nextStatus: LeadStatus = lead.status === "New" ? "Done" : "New";
  return inlineKeyboard([
    [inlineButton(`Mark ${nextStatus}`, `lead:status:${lead.id}:${nextStatus}`)],
    [inlineButton("Delete lead", `lead:delete:${lead.id}`)],
    [inlineButton("Back to inbox", "lead:inbox:0")],
  ]);
}

/** Render the private inbox for an already-authenticated owner. */
export async function openLeadInbox(ctx: Ctx, page: number, edit: boolean): Promise<void> {
  const store = leadStore(ctx);
  if (!store) {
    await ctx.reply("Lead storage is not available yet.");
    return;
  }
  let leads: Lead[];
  try {
    leads = await store.list();
  } catch {
    await ctx.reply("We could not open the lead inbox. Please try again shortly.");
    return;
  }
  if (leads.length === 0) {
    const options = { reply_markup: inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]) };
    if (edit) await ctx.editMessageText("No leads yet — submitted leads will appear here.", options);
    else await ctx.reply("No leads yet — submitted leads will appear here.", options);
    return;
  }
  const result = paginate(leads, { page, perPage: PAGE_SIZE, callbackPrefix: "lead:page", prevLabel: "Previous", nextLabel: "Next" });
  const rows: InlineButton[][] = result.pageItems.map((lead) => [inlineButton(`${lead.status} · ${lead.name}`, `lead:view:${lead.id}`)]);
  rows.push(...result.controls.inline_keyboard, [inlineButton("Back to menu", "menu:main")]);
  const options = { reply_markup: inlineKeyboard(rows) };
  const text = `Lead inbox · Page ${result.page + 1} of ${result.totalPages}`;
  if (edit) await ctx.editMessageText(text, options);
  else await ctx.reply(text, options);
}

async function openLead(ctx: Ctx, id: string): Promise<void> {
  const store = leadStore(ctx);
  if (!store) {
    await ctx.reply("Lead storage is not available yet.");
    return;
  }
  try {
    const lead = await store.get(id);
    if (!lead) {
      await ctx.editMessageText("This lead is no longer available.", { reply_markup: inlineKeyboard([[inlineButton("Back to inbox", "lead:inbox:0")]]) });
      return;
    }
    await ctx.editMessageText(detailText(lead), { reply_markup: detailKeyboard(lead) });
  } catch {
    await ctx.reply("We could not open that lead. Please try again shortly.");
  }
}

composer.command("admin", async (ctx) => {
  if (!(await requireOwner(ctx as unknown as OwnerAwareCtx))) return;
  await openLeadInbox(ctx, 0, false);
});

composer.callbackQuery(/^lead:(?:inbox|page:(?:prev|next)):(\d+)$/, async (ctx) => {
  if (!(await requireOwner(ctx as unknown as OwnerAwareCtx))) return;
  await ctx.answerCallbackQuery();
  await openLeadInbox(ctx, Number(ctx.match[1]), true);
});

composer.callbackQuery(/^lead:view:([\w-]+)$/, async (ctx) => {
  if (!(await requireOwner(ctx as unknown as OwnerAwareCtx))) return;
  await ctx.answerCallbackQuery();
  await openLead(ctx, ctx.match[1]);
});

composer.callbackQuery(/^lead:status:([\w-]+):(New|Done)$/, async (ctx) => {
  if (!(await requireOwner(ctx as unknown as OwnerAwareCtx))) return;
  await ctx.answerCallbackQuery();
  const store = leadStore(ctx);
  if (!store) {
    await ctx.reply("Lead storage is not available yet.");
    return;
  }
  try {
    const lead = await store.updateStatus(ctx.match[1], ctx.match[2] as LeadStatus);
    if (!lead) {
      await ctx.editMessageText("This lead is no longer available.", { reply_markup: inlineKeyboard([[inlineButton("Back to inbox", "lead:inbox:0")]]) });
      return;
    }
    await ctx.editMessageText(`Lead marked ${lead.status}.\n\n${detailText(lead)}`, { reply_markup: detailKeyboard(lead) });
  } catch {
    await ctx.reply("We could not update that lead. Please try again shortly.");
  }
});

composer.callbackQuery(/^lead:delete:([\w-]+)$/, async (ctx) => {
  if (!(await requireOwner(ctx as unknown as OwnerAwareCtx))) return;
  await ctx.answerCallbackQuery();
  await ctx.editMessageText("Delete this lead? This cannot be undone.", {
    reply_markup: inlineKeyboard([
      [inlineButton("Delete", `lead:delete-confirm:${ctx.match[1]}`), inlineButton("Keep lead", `lead:view:${ctx.match[1]}`)],
    ]),
  });
});

composer.callbackQuery(/^lead:delete-confirm:([\w-]+)$/, async (ctx) => {
  if (!(await requireOwner(ctx as unknown as OwnerAwareCtx))) return;
  await ctx.answerCallbackQuery();
  const store = leadStore(ctx);
  if (!store) {
    await ctx.reply("Lead storage is not available yet.");
    return;
  }
  try {
    const deleted = await store.delete(ctx.match[1]);
    await ctx.editMessageText(deleted ? "Lead deleted." : "This lead is no longer available.", {
      reply_markup: inlineKeyboard([[inlineButton("Back to inbox", "lead:inbox:0")]]),
    });
  } catch {
    await ctx.reply("We could not delete that lead. Please try again shortly.");
  }
});

export default composer;
