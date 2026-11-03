hello everyone, this is my project yapsearch.

these search and reasoning capabilities will be added to our agent within yapthread (app.yapthread.com). 

feel free to fork this.

follow me (if that's even a feature on this app)

if there is bad code in here, i did not write it, and send your complaints to support@anthropic.com.

thank you!

## Accent Detector (`/accent`)

Record someone speaking (or upload a clip) and find out whether their accent is genuine or put on. The audio goes to an OpenAI audio-input model, which listens for typical tells of a fake accent: features that show up on some words but not others, drift over the clip, hypercorrection, and intonation that doesn't match the vowels. It returns an authenticity score, a consistency score, specific evidence and slips, coaching tips, and a transcript.

Setup (inside `template-2/`):

```
OPENAI_API_KEY=sk-...            # required
OPENAI_AUDIO_MODEL=gpt-audio     # optional; any chat-completions model that accepts input_audio
```

Then run `npm run dev` and open http://localhost:3000/accent.
