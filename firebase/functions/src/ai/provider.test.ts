/**
 * Unit tests for the vision + safety wiring in llmGenerate. The network call is
 * mocked (global.fetch) so we assert on the exact request body we send Gemini —
 * specifically that an attached image becomes an inline_data part on the final
 * user turn, and that the provider safety layer is left ON for image reads but
 * OFF for text (BLOCK_NONE, so the persona owns its boundaries).
 */
import { llmGenerate } from './provider';

type FetchBody = {
  contents: Array<{ role: string; parts: Array<Record<string, unknown>> }>;
  safetySettings?: unknown[];
};

function mockGeminiOnce(): () => FetchBody {
  const captured: { body?: FetchBody } = {};
  global.fetch = jest.fn(async (_url: unknown, init: unknown) => {
    captured.body = JSON.parse((init as { body: string }).body) as FetchBody;
    return {
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }),
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return () => captured.body!;
}

describe('llmGenerate vision + safety', () => {
  afterEach(() => jest.restoreAllMocks());

  it('attaches an image as an inline_data part on the final user turn', async () => {
    const getBody = mockGeminiOnce();
    await llmGenerate(
      {
        tier: 'reading',
        system: 'sys',
        userText: 'look at this',
        images: [{ data: 'QUJD', mimeType: 'image/jpeg' }],
      },
      'key',
    );
    const body = getBody();
    const parts = body.contents[body.contents.length - 1].parts;
    expect(parts[0]).toEqual({ text: 'look at this' });
    expect(parts).toContainEqual({ inline_data: { mime_type: 'image/jpeg', data: 'QUJD' } });
  });

  it('leaves safety ON for an image read (no BLOCK_NONE settings sent)', async () => {
    const getBody = mockGeminiOnce();
    await llmGenerate(
      { tier: 'reading', system: 'sys', userText: 'hi', images: [{ data: 'QUJD', mimeType: 'image/png' }] },
      'key',
    );
    expect(getBody().safetySettings).toBeUndefined();
  });

  it('keeps safety OFF (BLOCK_NONE) for a text-only read', async () => {
    const getBody = mockGeminiOnce();
    await llmGenerate({ tier: 'reading', system: 'sys', userText: 'hi' }, 'key');
    const body = getBody();
    expect(Array.isArray(body.safetySettings)).toBe(true);
    expect(body.safetySettings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' }),
      ]),
    );
  });

  it('disableSafety:false forces safety ON even for a text read', async () => {
    const getBody = mockGeminiOnce();
    await llmGenerate({ tier: 'reading', system: 'sys', userText: 'hi', disableSafety: false }, 'key');
    expect(getBody().safetySettings).toBeUndefined();
  });
});
