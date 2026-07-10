---
name: OverTalk Design System
colors:
  surface: '#131315'
  surface-dim: '#131315'
  surface-bright: '#39393b'
  surface-container-lowest: '#0e0e10'
  surface-container-low: '#1c1b1e'
  surface-container: '#201f22'
  surface-container-high: '#2a2a2c'
  surface-container-highest: '#353437'
  on-surface: '#e5e1e4'
  on-surface-variant: '#d8c3ad'
  inverse-surface: '#e5e1e4'
  inverse-on-surface: '#313032'
  outline: '#a08e7a'
  outline-variant: '#534434'
  surface-tint: '#ffb95f'
  primary: '#ffc174'
  on-primary: '#472a00'
  primary-container: '#f59e0b'
  on-primary-container: '#613b00'
  inverse-primary: '#855300'
  secondary: '#bac8dc'
  on-secondary: '#243141'
  secondary-container: '#3a4859'
  on-secondary-container: '#a8b6ca'
  tertiary: '#c1cce8'
  on-tertiary: '#263046'
  tertiary-container: '#a6b1cc'
  on-tertiary-container: '#39445a'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffddb8'
  primary-fixed-dim: '#ffb95f'
  on-primary-fixed: '#2a1700'
  on-primary-fixed-variant: '#653e00'
  secondary-fixed: '#d6e4f9'
  secondary-fixed-dim: '#bac8dc'
  on-secondary-fixed: '#0f1c2c'
  on-secondary-fixed-variant: '#3a4859'
  tertiary-fixed: '#d7e2ff'
  tertiary-fixed-dim: '#bbc6e2'
  on-tertiary-fixed: '#101b30'
  on-tertiary-fixed-variant: '#3c475d'
  background: '#131315'
  on-background: '#e5e1e4'
  surface-variant: '#353437'
typography:
  display-lg:
    fontFamily: Space Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1.0'
    letterSpacing: 0.1em
  translation-text:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '500'
    lineHeight: '1.4'
    letterSpacing: -0.01em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 8px
  container-padding-desktop: 40px
  container-padding-mobile: 20px
  gutter: 24px
  stack-sm: 12px
  stack-md: 24px
  stack-lg: 48px
---

## Brand & Style

The design system is engineered to feel like a high-performance instrument for global communication. It targets professionals, diplomats, and power users who require instantaneous, reliable translation without the typical "friendly assistant" tropes. The aesthetic is **Premium Tech-Minimalism** with a "Dark Mode First" philosophy, borrowing the precision of high-end productivity tools and the immersive depth of professional gaming interfaces.

The emotional response should be one of **absolute confidence and empowerment**. We achieve this through a "Void" background strategy—using deep blacks to make interface elements appear as if they are floating in high-fidelity space. The style utilizes **Glassmorphism** and **Luminescent Accents** to provide rich detail without clutter, emphasizing speed, accuracy, and transformative capability.

## Colors

The palette is anchored by **Deep Black (#08080a)**, which serves as the "Void" background, ensuring maximum contrast and reducing visual fatigue during long sessions. 

- **Primary Action (Amber Gold):** Used exclusively for critical interactive paths, active translation states, and primary CTAs. It represents the "spark" of understanding.
- **Secondary/Surface (Navy):** Used for container backgrounds and structural elements. These tones are layered to create a sense of environmental depth.
- **Support Colors:** Use ultra-low-opacity versions of the Amber Gold for "inner glows" and focus states to simulate hardware-like illumination.

## Typography

This design system utilizes a high-contrast typographic pairing to balance technical precision with readability.

- **Headlines:** **Space Grotesk** provides a wide, geometric, and futuristic feel. Use tighter letter spacing for large display text to create a compact, "engineered" look.
- **Body:** **Inter** is the workhorse for all functional text, ensuring legibility across diverse character sets—crucial for a translation app.
- **Technical Labels:** **JetBrains Mono** is used for metadata (e.g., language codes, timestamps, "Live" indicators) to reinforce the tool's sophisticated, data-driven nature.

## Layout & Spacing

The layout follows a **Fixed-Fluid Hybrid** model. While the central translation feed is centered and fixed-width (max 800px) for focus, the utility sidebars and controls utilize fluid margins to dock to the screen edges.

- **The 8px Rhythm:** All spacing increments must be multiples of 8px. 
- **Breathing Room:** Use aggressive `stack-lg` spacing between major functional blocks (e.g., the input area and the history log) to maintain a minimal, high-end feel.
- **Mobile Reflow:** On mobile, sidebars collapse into a bottom-anchored "Command Bar," and container padding reduces to 20px to maximize the space for translated text.

## Elevation & Depth

Hierarchy is established through **Z-axis Layering** rather than traditional shadows. 

1. **The Base:** Deep Black (#08080a) absolute background.
2. **The Surface:** Navy (#0d1b2a) at 60% opacity with a 20px Backdrop Blur. This "Glass" effect is used for all floating cards and panels.
3. **The Highlight:** A 1px "Inner Stroke" (Top and Left only) using a low-opacity white (10%) to simulate a light source catching the edge of the glass.
4. **The Glow:** Primary action elements (Amber Gold) emit a subtle outer blur (Spread: 0, Blur: 15px, Opacity: 15%) to indicate they are "powered on."

## Shapes

The shape language is **Technical and Precise**. We avoid overly bubbly or circular aesthetics in favor of "Softened Industrial" corners.

- **Standard Elements:** Buttons, inputs, and small chips use a `0.25rem` (4px) radius.
- **Main Containers:** Larger surface areas like the translation feed or side panels use `0.75rem` (12px) to provide a sophisticated structure.
- **Interactive States:** When hovered, primary elements may increase their visual weight via border-glows rather than changing shape.

## Components

- **Primary Translation Button:** A large, Amber Gold component. Instead of a flat color, it uses a subtle top-to-bottom gradient (#f59e0b to #d97706) and a 1px border of #fbbf24.
- **Input Fields:** These should appear as "cutouts" into the UI. No background color; only a bottom border of Navy (#1b263b). Upon focus, the border transitions to Amber Gold with a subtle glow.
- **Language Chips:** Small, technical tags using JetBrains Mono. Use the Navy secondary color for the background with a 1px solid border.
- **Translation Cards:** Utilize the Glassmorphic treatment (Backdrop Blur). Use the Amber Gold for the "Translated" text and a muted gray for the "Original" text.
- **The Waveform:** A custom component for real-time voice translation. It should use a gradient stroke of Amber Gold, pulsating vertically to reflect audio input levels.
- **Command Bar:** A bottom-docked utility bar containing settings, history, and profile. It should be semi-transparent with a heavy backdrop blur to keep the focus on the content behind it.