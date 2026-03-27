<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# DevStudio-AI

- Preview the app: https://venerable-torte-afdd66.netlify.app/
- View your app in AI Studio: https://ai.studio/apps/3bac7e82-c7a2-4f53-973b-ca372b8df60b

### Authors

- Michele Bucca (michele.bucca@gmail.com)

## Introduction

Hi, this App is an IDE for frontend development. Of course this does not prevent you from using it for other purposes. It has been vibe-coded using [Google AI Studio](https://aistudio.google.com) and fixed by the [Netlify Agent](https://www.netlify.com) so that it doesn't leak my GEMINI API keys in the code

> [!CAUTION]
> This App includes an AI Chatbot that uses my free GEMINI API KEY  Please, be kind and don't abuse the service! 

The app is splitted between frontend and backend

**Backend:** `src/services/`
**Frontend:** `/index.html`, `src/components/`, `src/App.tsx`, etc

### Features

- **AI Chatbot:** ask him to build something for you
- **Supports Git:** you can save and restore the changes of your files thanks to the history tab. This features is implemented thanks to git. 
- **Keep your work safe:** You can download your project as a zip file. It also contains the .git folder, so that you can bring your work history with you!
- **Live Preview:** See the results of your hard work thanks to the live preview feature! Perfect when you work on markdown files and your fronend projects

### Bugs

- Make sure to do your first commit manually because the fist one that is done automatically by the IDE is empty.
- There are still a few visual glitches and improvements that I need to do.


## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`
