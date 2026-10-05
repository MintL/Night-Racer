# GDD.md

# Rally Web Remake — Game Design Document

## 1. Project vision

Remake the original 2013 XNA rally game for the browser while preserving the identity of the original game.

The goal is not to reproduce the old implementation exactly. The goal is to recreate the same core experience with modern rendering, physics, tooling, and presentation.

The remake should feel recognizably like the original game, but look and play like a version that could reasonably have been made with modern technology.

The original XNA source is the primary behavioral and visual reference.

---

## 2. Design pillars

### Preserve the original identity

The remake should keep the defining traits of the original:

- Procedurally generated rally tracks
- Procedurally generated terrain
- Fast arcade-style driving
- Third-person chase camera
- Strong atmosphere
- Forested terrain and environmental effects
- Lap-based racing with checkpoints
- Seed-driven world generation
- Simple, readable controls

### Improve the physical feel

The original game used a custom kinematic vehicle model.

The remake should preserve its responsiveness and arcade character while improving:

- Suspension
- Ground contact
- Slopes and uneven terrain
- Sliding and grip
- Collisions
- Jumps and bumps
- Interaction with physical objects

The goal is not realistic motorsport simulation.

### Modernize the presentation

The remake should improve the original visual intent through:

- Modern lighting
- Better shadows
- PBR materials
- Improved reflections
- Better fog and atmosphere
- Modern particles
- Improved weather
- Better post-processing
- Higher quality anti-aliasing
- Better environmental depth

Visual improvements should support the original style rather than redesign it into a different game.

### Keep the game immediately playable

The game should remain simple to understand.

A player should be able to open the game, start a race, and understand the controls almost immediately.

---

## 3. Target platform

Primary target:

- Desktop web browser

Initial controls:

- Keyboard
- Gamepad

Touch controls are not part of the initial scope.

Networking is not part of the initial remake.

---

## 4. Core game loop

The basic game loop is:

1. Start a race.
2. Generate a rally track and surrounding terrain from a seed.
3. Complete the countdown.
4. Drive through the ordered checkpoints.
5. Complete the required laps.
6. Finish the race.
7. View race time and lap times.
8. Start another race with the same or a new seed.

The focus is on driving rather than progression systems.

---

## 5. Driving

## Driving style

The game should feel:

- Fast
- Responsive
- Slightly loose
- Easy to understand
- Difficult to drive perfectly

The car should be forgiving enough that the player can recover from imperfect driving, but fast driving should reward good steering, braking, and line choice.

The remake should not become a hardcore rally simulator.

## Vehicle behavior

The original handling should be used as the baseline reference for:

- Acceleration
- Top speed
- Steering response
- Steering return
- Braking
- Coasting friction
- Turning radius
- Camera response to speed

Modern vehicle physics may change the implementation, but not the fundamental character.

## Modern physics goals

A modern vehicle system should add:

- Four-wheel suspension
- Stable terrain contact
- Natural response to bumps
- Limited body roll
- Predictable grip loss
- Recoverable sliding
- Physical collision with scenery and other objects
- Support for jumps where terrain allows it

The physics should remain deliberately tuneable toward arcade handling.

---

## 6. Track generation

Tracks are procedurally generated from a seed.

The original game generates a closed loop using a small set of curve control points distributed around the center of the terrain.

The remake should preserve the idea of:

- Closed rally circuits
- Smooth spline-based roads
- Significant elevation variation
- Curves that remain readable at speed
- Tracks embedded naturally into the surrounding terrain

The generation system may later be improved, but the first version should reproduce the original algorithm closely enough to provide a direct comparison.

## Seed behavior

The same seed must always generate the same world within the remake.

Matching the exact historical C# output for a given seed is desirable, but not required for the first playable milestone.

If exact compatibility is implemented later, it should be treated as a deliberate compatibility feature.

---

## 7. Terrain

The world is built around a generated heightmap.

The road is carved or blended into the terrain.

Terrain should include recognizable material regions such as:

- Road
- Grass
- Rock
- Snow or high-altitude terrain

Material blending should be based on terrain properties rather than visible hard boundaries.

The road should remain visually clear at driving speed.

## Terrain gameplay

Terrain should influence driving physically.

Examples:

- Road provides the most predictable grip.
- Grass reduces grip and speed.
- Rough terrain should become increasingly difficult to drive across.
- Steep terrain should naturally prevent unrealistic shortcuts.

The original game strongly constrained the car to the generated road ribbon. The remake can use more physical terrain interaction while preserving the intended race route.

---

## 8. Environment

The environment should feel like a stylized rally landscape rather than an empty generated heightmap.

Initial scenery:

- Trees
- Rocks
- Grass and ground detail
- Checkpoint markers
- Sky
- Atmospheric fog

Scenery should be generated from the same seed as the world when practical.

Scenery should not obstruct the track unfairly.

Physical scenery may be introduced selectively. Not every small object needs collision.

---

## 9. Weather and atmosphere

Atmosphere is an important part of the original game's identity.

The remake should support environmental effects such as:

- Rain
- Thunder
- Lightning
- Dust
- Smoke
- Fireflies
- Fog
- Ambient forest effects

These do not all need to be present in the first playable build.

Weather should eventually affect the visual mood strongly.

Gameplay effects such as reduced grip in rain can be explored later, but visual weather should come first.

---

## 10. Lighting and rendering

The original game used a custom deferred/prelighting renderer, dynamic lights, shadow maps, environment reflections, bloom, fog, and motion blur.

The remake should recreate the visual intent using modern techniques rather than reproducing the old rendering architecture.

Desired visual features:

- Directional sunlight or moonlight
- Dynamic point lights
- Modern shadows
- PBR car materials
- Environment reflections
- Terrain material blending
- Atmospheric fog
- Bloom
- Subtle motion blur if it improves speed perception
- Modern color grading where useful
- GPU-friendly particles

Effects should be restrained enough that the road remains readable during fast driving.

---

## 11. Camera

The main camera is a third-person chase camera.

It should:

- Follow the car smoothly
- Rotate toward the car's heading
- Lag slightly behind rapid movement
- Increase distance subtly at higher speed
- Allow limited manual camera adjustment
- Return toward the default chase position after manual movement

The original camera behavior should be used as the baseline.

The camera should prioritize driving readability over physical realism.

---

## 12. Race structure

Initial race mode:

- Single-player circuit race
- Three laps
- Ordered checkpoints
- Countdown
- Race timer
- Lap timer
- Finish state

The checkpoint system ensures the player completes the intended route rather than cutting directly across the terrain.

Initial race results should show:

- Total race time
- Individual lap times

Multiplayer race placement is out of scope initially.

---

## 13. Checkpoints

Checkpoints should be visually obvious without feeling like abstract floating game UI.

Possible presentation:

- Light markers
- Gate structures
- Fire or flare effects
- Roadside markers
- Subtle projected or emissive indicators

Checkpoint visuals can evolve beyond the original implementation while retaining the original sense of spectacle.

---

## 14. HUD

The HUD should be minimal and readable at speed.

Initial HUD elements:

- Speed
- Current lap
- Race time
- Current position only if relevant
- Countdown
- Checkpoint/lap notifications

The original speedometer assets may be used as a reference, but the interface can be modernized.

Avoid covering large portions of the driving view.

---

## 15. Menus

Menus should be redesigned for a modern browser game rather than recreated from the desktop XNA version.

Initial menu scope should remain small.

Required:

- Play
- Seed selection or random seed
- Settings
- Restart race
- Return to main menu

The game should automatically adapt to the browser viewport. Do not expose desktop-style resolution selection.

Settings may initially include:

- Graphics quality
- Fullscreen toggle where supported
- Master, music, and effects volume
- Controls
- Accessibility options as needed

Avoid desktop-specific options such as resolution selection, display adapters, window modes, or an explicit quit button.

Menus should feel lightweight and immediate, with fast transitions and layouts that respond naturally to different browser window sizes.

A full recreation of every legacy menu is not required.

---

## 16. Audio

The original audio assets should be reused where appropriate.

Important audio categories:

- Engine
- Tire/skid sounds
- Checkpoint sounds
- Rain
- Thunder
- Wind
- Forest ambience
- Menu feedback

The engine sound should eventually respond dynamically to vehicle speed and load rather than simply loop at a fixed pitch.

The initial version can use a simpler implementation.

---

## 17. Art direction

The remake should not become photorealistic by default.

The visual target is:

> A cleaner, more atmospheric, more technically polished interpretation of the original game.

The original geometry, colors, terrain composition, weather, and dramatic lighting should remain recognizable.

Modern materials and lighting should add depth rather than replace the original visual identity.

---

## 18. Initial playable milestone

The first meaningful milestone is a complete but visually simple race.

It should include:

- Browser launch
- Deterministic seeded generation
- Original-style procedural track
- Generated terrain
- Car model
- Driveable vehicle
- Chase camera
- Track/terrain interaction
- Checkpoints
- Three laps
- Countdown
- Race timer
- Finish state

At this stage:

- Networking is excluded.
- Advanced weather is excluded.
- Advanced post-processing is optional.
- Menus may be minimal.
- Visual fidelity is secondary to matching the original game's feel.

This milestone should answer the most important question:

> Does this still feel like the same game?

---

## 19. Second milestone — modernize the experience

Once the baseline race feels correct, improve:

- Vehicle suspension and grip
- Terrain materials
- Lighting
- Shadows
- Reflections
- Foliage
- Particles
- Weather
- Audio
- HUD
- Post-processing
- Environmental density

Each change should be compared against the original game's identity rather than judged only by technical sophistication.

---

## 20. Out of scope for the initial remake

Do not prioritize:

- Multiplayer
- Network server compatibility
- Mobile controls
- Online accounts
- Progression systems
- Career mode
- Vehicle customization beyond simple visual options
- Multiple car classes
- Large content expansion
- Exact preservation of old rendering bugs
- Exact XNA architecture

These can be reconsidered after the single-player remake is stable and enjoyable.

---

## 21. Design decision rule

When deciding whether to preserve or replace something from the original game, ask:

> Is this part of what made the game feel like itself, or was it simply a technical limitation of the 2013 implementation?

Preserve the former.

Modernize the latter.
