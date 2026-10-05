# Legacy art and sound used by the web remake

These files come from `legacy/datx02-rally/datx02-rallyContent/`. The legacy project remains the source of record.

| Web asset | Legacy source | Notes |
| --- | --- | --- |
| `car/porsche.FBX`, `car/*.JPG` | `Models/Cars/porsche.FBX`, `Models/Cars/Textures/*.JPG` | Three.js `FBXLoader` loads the FBX 7.2 model and finds textures in the same folder. Its front faces local **−Z**. Raw model bounds are approximately 31.04 × 21.70 × 75.17 FBX units. Scale the loaded group by **0.0254** to match legacy world coordinates scaled by 0.01; the FBX's 2.54 unit factor accounts for the difference. The front wheels are `wheel001` and `wheel002`. |
| `terrain/grass.jpg`, `rock.jpg`, `sand.jpg`, `snow.jpg` | `Terrain/*.dds` | Converted from DDS to JPEG. Road, grass, rock, and snow are blended in the terrain; sand is retained as a source asset. |
| `terrain/road.jpg`, `road_n.png` | `Terrain/road.jpg`, `road_n.png` | Original road color and normal textures. |
| `skybox/skybox_*.png` | `SkyBoxes/PurpleSky/skybox_*.png` | The six faces selected in `GamePlayView.cs`, including `skybox_back6_2.png`, form the purple night sky and car reflections. |
| `scenery/birch_01.glb`–`birch_04.glb` | `Foliage/birch_01.fbx`–`birch_04.fbx`; `Foliage/Textures/bark.jpg`, `branches.png`, `branches_Alpha.png` | Converted from FBX 6.1 with Godot 4.7. The inverted branch mask is embedded as leaf alpha; leaves use alpha cutoff on both sides. The four original variants are selected from the world seed at the XNA scale range of 3–6. |
| `scenery/oak_tree.glb` | `Foliage/oak_tree.fbx`; mossy bark and maple leaf textures in `Foliage/Textures/` | Converted with Godot 4.7. Embedded color, normal, and inverted leaf alpha textures retain the original oak model at scale 3–6. |
| `scenery/stone_01.glb`, `stone_02.glb` | `Foliage/stone_01.fbx`, `stone_02.fbx`; `Foliage/Textures/stone_c.png`, `stone_n.png` | Converted with Godot 4.7, with embedded color and normal textures. The original two variants use scale 0.5–0.75. |
| `menu/*.png`, `hud/*.png` | `Menu/` and `HUD/` | Original cosmic menu background, title, panel, borders, button art, and speedometer face and needle. `menu-selected.png` is retained as a reference asset. |
| `particles/smoke.png`, `smoke_2.png` | `Particles/smoke.png`, `smoke_2.png` | Original sprites used for the checkpoint smoke and fire billboards. |
| `audio/engine-loop.wav`, `tire-skid-loop.wav`, `checkpoint.wav` | `Audio/Sources/Engine/ultimateengine.wav`, `Tires/conttireskid1.wav`, `Effects/checkpointpass1.wav` | Original PCM audio. The engine and skid clips have short end-to-start crossfades baked in for smoother looping; the checkpoint clip is unchanged. |
| `audio/forestambient1.wav`, `softrain1.wav` | `Audio/Sources/Ambient/forestambient1.wav`, `Rain/softrain1.wav` | Unchanged original forest and rain loops. Rain audio follows the menu setting. |

The legacy repository contains no license or asset attribution file. Confirm distribution rights for the legacy art and audio before a public release.
