
# Change Log

## [1.4.0] - 2025-10-28
### Added
- **Project Persistence**: Added ability to Save (`.vmix` export) and Load workspace projects.
- **Code Architecture**: Introduced modular file structure with `hooks/` and `components/` folders.
- **Hook-based State**: Refactored undo/redo history into `useCanvasHistory` hook.
- **Component Abstraction**: Extracted `LayerPanel` into a dedicated component.

## [1.3.0] - 2025-10-27
### Added
- **Undo/Redo System**: Implemented a robust 15-step history buffer for all canvas operations including add, remove, move, scale, and rotate.
- **Visual Toolbar**: Added dedicated Undo and Redo buttons to the workspace toolbar.

## [1.2.0] - 2025-10-27
### Fixed
- **Canvas Boundaries**: Implemented coordinate clamping to prevent images from being dragged off-screen.
- **Navigation**: Added a "Center Layer" button to quickly recover lost assets.
### Improved
- **Touch Accessibility**: Increased hit areas for resize handles to improve mobile usability.

## [1.1.0] - 2025-10-27
### Changed
- **Resize Logic**: Replaced standard range sliders with direct-manipulation drag handles on the canvas for intuitive scaling.
- **Selection UI**: Added visual selection borders and corner handles for active layers.

## [1.0.0] - 2024-05-20
### Added
- Initial release of VisionMix AI.
- Integration with Gemini 2.5 Flash Image for editing/generation.
- Integration with Gemini 3 Flash Preview for prompt improvement.
- Light and Dark mode support using Tailwind CSS.
- Mobile-responsive layout with sticky navigation.
- Error reporting system with unique reference IDs.
- Local history session for recently generated images.
