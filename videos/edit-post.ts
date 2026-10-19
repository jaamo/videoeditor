import { defineVideo } from "../src/define.ts";
import { fakeCall } from "../src/fake-call.ts";

// The demo account's interview "What building a small product team taught me" and the
// post this video edits. The video edits it by hand and with Maya, and analyses it; all of
// that is saved for real, so setup puts the post back first.
const POST_ID = 1;
const POST_TEXT = `We spent four months building a dashboard.

Nobody opened it.

Not because it was bad. Because what people actually wanted was one number, in their inbox, on Monday morning.

We deleted the dashboard and sent the email. Usage went from "some" to "everyone".

The lesson I keep relearning: ask what decision someone is trying to make, not what screen they want.`;

const editor = "textarea[placeholder='Write your post...']";
const composer = "textarea[placeholder='Ask for a change...'], input[placeholder='Ask for a change...']";
/** Maya's replies are one blocking AI call, often well over 10s. */
const AI_TIMEOUT = 150_000;

export default defineVideo({
  model: "eleven_v4",
  title: {
    headline: { en: "From one conversation to a week of posts", fi: "Yhdestä keskustelusta viikon postaukset" },
    sub: "Outerview",
  },
  end: {
    headline: { en: "You talk. We write.", fi: "Sinä puhut. Me kirjoitamme." },
    sub: { en: "You publish.", fi: "Sinä julkaiset." },
    url: "outerview.app",
  },
  intro: {
    say: {
      en: "Hi! I wanted to show you how editing text works in our product.",
      fi: "Moro! [clears throat] Mä ajattelin nyt näyttää, että miten tekstin muokkaaminen tapahtuu meidän tuotteessa.",
    },
  },
  // Maya's mic check. The browser has a fake microphone, so it says "We hear you"; the
  // call after "Ready to start" is played by fakeCall (see setup), not a real one.
  start: "/interview/1/live",
  music: "assets/music/track.mp3",

  /**
   * Put the post back exactly as it was: its text, and none of what editing it leaves
   * behind (Maya's chat, History versions, analyses, the edit lessons the app learns from
   * a hand edit) or what it costs (AI edits count against the free plan's 10 a month).
   */
  async setup({ page, sql, userId }) {
    await sql("DELETE FROM post_chat_messages WHERE post_id = $1", [POST_ID]);
    await sql("DELETE FROM post_versions WHERE post_id = $1 AND change_type IN ('manual_edit', 'ai_refine', 'restore')", [POST_ID]);
    await sql("DELETE FROM post_analyses WHERE post_id = $1", [POST_ID]);
    await sql("DELETE FROM post_edit_lessons WHERE post_id = $1", [POST_ID]);
    await sql("DELETE FROM usage_records WHERE user_id = $1 AND resource_id = $2 AND action_type = 'post_refinement'", [userId, POST_ID]);
    const updated = await sql("UPDATE posts SET text = $1, status = 'draft' WHERE id = $2 AND user_id = $3 RETURNING id", [POST_TEXT, POST_ID, userId]);
    if (!updated.length) throw new Error(`Post ${POST_ID} isn't the demo user's`);
    await page.reload({ waitUntil: "networkidle" });

    // The call: scripted, so it costs nothing, saves nothing, and reads the same every take.
    await fakeCall(page, [
      { maya: "Hi! I'm Maya. Today let's talk about what building a small product team taught you." },
      { you: "Honestly? Ship less. And ask what decision people are actually trying to make." },
      { maya: "I love that. Can you give me an example of when that changed what you built?" },
      { you: "We spent four months on a dashboard that nobody ever opened." },
    ]);
  },

  steps: [
    {
      say: {
        en: "It creates content from interviews.",
        fi: "Tää systeemi siis luo sisältöjä haastatteluiden perusteella.",
      },
      do: async (d) => {
        await d.click("button:has-text('Ready to start')");
        await d.wait(600);
        await d.overview();
      },
    },
    {
      say: {
        en: "First, you talk with the AI interviewer for about ten minutes, about any topic.",
        fi: "Ekaks jutellaan agentin kanssa joku kymmenen minuuttia jostain aiheesta.",
      },
      // Into the conversation as Maya's first line lands in the transcript.
      do: (d) => d.focus("text=Today let's talk"),
    },
    {
      say: {
        en: "Then LinkedIn posts written from the interview show up here.",
        fi: "Ja sen jälkeen tänne ilmestyy näitä valmiita LinkedIn-postauksia haastattelun pohjalta.",
      },
      do: async (d) => {
        await d.goto("/transcripts");
        await d.overview();
        await d.click("text=View posts");
        await d.page.waitForLoadState("networkidle");
        await d.overview();
      },
    },
    {
      say: { en: "I'll open my favourite.", fi: "Mä avaan tästä mun suosikin." },
      do: async (d) => {
        await d.click("text=We spent four months building a dashboard");
        // The click opens a different screen; bring the camera to the post.
        await d.focus(editor);
      },
    },
    {
      say: {
        en: "I can edit it by hand, until it's exactly how I want it.",
        fi: "Ja mä voin muokata tätä sitte käsin tai tekoälyn avulla just semmoseks ku haluun. [laugh] Tosin kaikki B2B-läpät pitää lisätä ihan ite.",
      },
      do: async (d) => {
        await d.select(editor, "The lesson I keep relearning");
        await d.keys("What I learned");
      },
    },
    {
      say: {
        en: "Or I can ask Maya to change it for me.",
        fi: "Tai sitte mä voin pyytää tätä tekemään muutokset mun puolesta.",
      },
      do: async (d) => {
        await d.type(composer, "Rewrite the first line as a short, sharp hook.");
        await d.click("button[aria-label='Send']");
        // Speed through Maya thinking; keep a moment of it so the wait shows.
        await d.cut(() => d.page.getByText("Working on it…").waitFor({ state: "hidden", timeout: AI_TIMEOUT }), {
          keepMs: 1500,
        });
      },
    },
    {
      say: {
        en: "I see exactly what changed, and approve it.",
        fi: "Mä näen heti, mitä muuttu, ja hyväksyn muutoksen.",
      },
      do: async (d) => {
        await d.highlight("[data-change]", { ms: 2200, all: true });
        await d.wait(1800);
        await d.click("button:text-is('Approve')");
      },
    },
    {
      say: {
        en: "Finally, Maya analyses the post: how it will perform, and whether it sounds like me.",
        fi: "Lopuks voin vielä analysoida postauksen: miten se toimii, ja kuulostaako se multa.",
      },
      do: async (d) => {
        await d.click("[data-testid='button-analyze']");
        await d.cut(() => d.page.getByRole("button", { name: "Apply suggestions" }).waitFor({ timeout: AI_TIMEOUT }), {
          keepMs: 1500,
        });
        await d.focus("button:has-text('Apply suggestions')");
        await d.wait(1200);
        await d.scrollTo("text=Voice Match");
        await d.focus("text=Voice Match");
      },
    },
    {
      say: { en: "And that's it. The post is ready to share!", fi: "Ja näi. Postaus on valmis. Viikon sisällöt syntyy tosi nopeesti." },
      do: (d) => d.focus(editor),
    },
  ],
});
