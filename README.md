
# VisionMix AI

**VisionMix AI** is a cutting-edge image generation and editing suite powered by Google's Gemini models. It allows users to generate hyper-realistic images from textual prompts and edit existing images by adding or merging new elements seamlessly.

## Key Features
- **Prompt Enhancement**: Transform simple ideas into complex descriptive prompts using Gemini 3 Pro.
- **AI Generation**: Create unique visuals with `gemini-2.5-flash-image`.
- **Advanced Canvas Studio**: 
  - **Direct Manipulation**: Drag, resize, and rotate assets directly on the canvas.
  - **Smart Composition**: Layer management with z-index sorting and auto-centering.
  - **Boundary Protection**: Smart constraints prevent losing assets off-screen.
- **File & Project Management**:
  - **Save/Load Projects**: Export your workspace to `.vmix` files to save your progress and reload later.
  - **Asset Management**: Easy drag-and-drop layer system.
- **History & State Management**: 
  - **Undo/Redo**: Robust 15-step undo/redo capability for worry-free editing.
  - **Session History**: Keep track of your recent generations.
- **Image Merging**: Upload multiple base images and use natural language to merge them into a cohesive scene.
- **Dual Themes**: Full Light and Dark mode support with smooth transitions.
- **Responsive UX**: Optimized for mobile, tablet, and desktop environments.
- **Robust Error Handling**: Real-time error reports with unique tracking IDs.

## Architecture & Code Structure
The codebase follows React best practices with clear separation of concerns:
- **`hooks/`**: Contains custom hooks like `useCanvasHistory` for logic reuse.
- **`components/`**: Reusable UI components like `LayerPanel` and `Navbar`.
- **`utils/`**: Helper functions for file management and project persistence.
- **`services/`**: API integration logic for Google Gemini.

## Powered By
Developed with ❤️ by **Yasin Mohammed Miah**.

## License
MIT License. Feel free to explore, modify, and build upon.
