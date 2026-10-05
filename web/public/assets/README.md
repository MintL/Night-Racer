# Legacy art and sound used by the web remake

These files come from `legacy/datx02-rally/datx02-rallyContent/`. The legacy project remains the source of record.

| Web asset | Legacy source | Notes |
| --- | --- | --- |
| `car/porsche.FBX`, `car/*.JPG` | `Models/Cars/porsche.FBX`, `Models/Cars/Textures/*.JPG` | Three.js `FBXLoader` loads the FBX 7.2 model and finds textures in the same folder. Its front faces local **−Z**. Raw model bounds are approximately 31.04 × 21.70 × 75.17 FBX units. Scale the loaded group by **0.0254** to match legacy world coordinates scaled by 0.01; the FBX's 2.54 unit factor accounts for the difference. The front wheels are `wheel001` and `wheel002`. |
| `terrain/grass.jpg`, `rock.jpg`, `sand.jpg`, `snow.jpg` | `Terrain/*.dds` | Converted from 512 × 512 DDS to JPEG for browser loading. |
| `terrain/road.jpg`, `road_n.png` | `Terrain/road.jpg`, `road_n.png` | Original road color and normal textures. |
| `scenery/birch_01.glb` | `Foliage/birch_01.fbx`, `Foliage/Textures/bark.jpg`, `branches.png`, `branches_Alpha.png` | Converted from FBX 6.1 with Godot 4.7. The separate branch mask was inverted into the embedded texture's alpha channel. Leaves use alpha cutoff and render on both sides. One unscaled instance is roughly 2.9 m tall; the original game placed birches at scale 3–6. |
| `scenery/stone_01.glb` | `Foliage/stone_01.fbx`, `Foliage/Textures/stone_c.png`, `stone_n.png` | Converted from FBX 6.1 with Godot 4.7. Color and normal textures are embedded. One unscaled instance is roughly 3.25 m wide; the original game placed stones at scale 0.5–0.75. |
| `audio/engine-loop.wav`, `tire-skid-loop.wav`, `checkpoint.wav` | `Audio/Sources/Engine/ultimateengine.wav`, `Tires/conttireskid1.wav`, `Effects/checkpointpass1.wav` | Original PCM audio. The engine and skid clips have short end-to-start crossfades baked in for smoother looping; the checkpoint clip is unchanged. |

The legacy repository contains no license or asset attribution file. Confirm distribution rights for the legacy art and audio before a public release.
