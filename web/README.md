# Night Racer web remake

Run the browser game from this directory:

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. `npm test` runs the deterministic simulation tests, and `npm run build` checks TypeScript and creates a production bundle.

## Controls

| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Throttle | W / Up | Right trigger |
| Brake / reverse | S / Down / Space | Left trigger |
| Steer | A / D or Left / Right | Left stick |
| Orbit camera | Q / E | Right stick |
| Reset on the road | R | Y / Triangle |
| Pause | Escape / P | Start |

## Relationship to the XNA game

The `legacy/` directory is the reference implementation and is excluded from this repository. The web version preserves the five-node closed track, original terrain parameters, road dimensions, 60 Hz handling constants, six checkpoints, and three-lap race format. One web world unit equals 100 XNA units.

The remake uses a seeded Mulberry32 generator, so a given seed is stable within the web game but does not reproduce C# `System.Random` output. The road is carved after terrain smoothing to keep the visible road and the driving surface aligned. Checkpoints must be crossed in order, as specified in the GDD. The XNA race accepted intermediate checkpoints in any order.

Rapier terrain contacts and four wheel raycasts add suspension, landing, pitch, and roll while the original arcade formulas still drive horizontal motion. The kinematic car can push dynamic props, but impacts currently do not redirect its horizontal path.

Seeded dust follows the rear wheels and reacts to speed, steering, and road or grass coverage. It changes visuals only.

The dusk scene includes seeded fireflies, and the menu's Rain setting adds a light visual rain curtain. Weather does not change grip yet.

The terrain blends the original road, grass, rock, and snow textures with the height-based weights from `TerrainModel.cs`. The Porsche FBX, terrain textures, and audio come from `legacy/`; [asset notes](public/assets/README.md) record the conversions. The original repository does not include a license or asset attribution file, so distribution rights should be checked before publishing the game.
