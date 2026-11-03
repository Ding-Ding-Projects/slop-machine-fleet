import {Hct, DynamicScheme, TonalPalette, MaterialDynamicColors as M, hexFromArgb, argbFromHex} from '@material/material-color-utilities';
const seed=argbFromHex('#c6f02a'); const h=Hct.fromInt(seed);
const roles=['primary','onPrimary','primaryContainer','onPrimaryContainer','secondary','onSecondary','secondaryContainer','onSecondaryContainer','tertiary','onTertiary','tertiaryContainer','onTertiaryContainer','error','onError','errorContainer','onErrorContainer','surface','surfaceDim','surfaceBright','surfaceContainerLowest','surfaceContainerLow','surfaceContainer','surfaceContainerHigh','surfaceContainerHighest','onSurface','onSurfaceVariant','outline','outlineVariant','inverseSurface','inverseOnSurface','inversePrimary','scrim','shadow','primaryFixed','primaryFixedDim','onPrimaryFixed','onPrimaryFixedVariant','tertiaryFixed','onTertiaryFixed'];
const out={};
for (const dark of [true,false]){
 const s=new DynamicScheme({sourceColorArgb:seed,variant:4,contrastLevel:0,isDark:dark,
  primaryPalette:TonalPalette.fromHueAndChroma(h.hue,Math.max(h.chroma,80)),
  secondaryPalette:TonalPalette.fromHueAndChroma(h.hue,14),
  tertiaryPalette:TonalPalette.fromHueAndChroma(190,44),
  neutralPalette:TonalPalette.fromHueAndChroma(h.hue,2),
  neutralVariantPalette:TonalPalette.fromHueAndChroma(h.hue,4)});
 const o={};for(const r of roles)o[r]=hexFromArgb(M[r].getArgb(s));out[dark?'dark':'light']=o;}
console.log(JSON.stringify(out));
