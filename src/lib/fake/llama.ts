// The F.A.K.E. llama: one SVG with four poses, switched by data-state on the
// root (idle, listen, ok, fake). Styles and animations live in globals.css.

export const LLAMA_SVG = `<svg class="llama" viewBox="0 0 320 400" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Llama">
  <defs>
    <radialGradient id="lw" cx="38%" cy="30%" r="75%">
      <stop offset="0" stop-color="#FFF6EA"/>
      <stop offset=".55" stop-color="#FBDDBA"/>
      <stop offset="1" stop-color="#E9B98C"/>
    </radialGradient>
    <radialGradient id="lwHead" gradientUnits="userSpaceOnUse" cx="128" cy="105" r="140">
      <stop offset="0" stop-color="#FFF8EE"/>
      <stop offset=".5" stop-color="#FCE0BF"/>
      <stop offset="1" stop-color="#E4AE7E"/>
    </radialGradient>
    <radialGradient id="lwNeck" gradientUnits="userSpaceOnUse" cx="140" cy="230" r="90">
      <stop offset="0" stop-color="#FFF3E2"/>
      <stop offset=".6" stop-color="#F8D4AE"/>
      <stop offset="1" stop-color="#DFA674"/>
    </radialGradient>
    <radialGradient id="lSnout" cx="40%" cy="30%" r="80%">
      <stop offset="0" stop-color="#FFFBF5"/>
      <stop offset="1" stop-color="#F3D2B0"/>
    </radialGradient>
    <linearGradient id="lEar" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FFE9D0"/>
      <stop offset="1" stop-color="#E5AC7A"/>
    </linearGradient>
    <linearGradient id="lEarIn" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFB59A"/>
      <stop offset="1" stop-color="#F58C6C"/>
    </linearGradient>
    <radialGradient id="lHood" cx="35%" cy="25%" r="85%">
      <stop offset="0" stop-color="#FFC266"/>
      <stop offset=".55" stop-color="#F59322"/>
      <stop offset="1" stop-color="#CF650A"/>
    </radialGradient>
    <linearGradient id="lShade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2A2A33"/>
      <stop offset=".6" stop-color="#101015"/>
      <stop offset="1" stop-color="#3B3B48"/>
    </linearGradient>
    <radialGradient id="lEye" cx="40%" cy="35%" r="70%">
      <stop offset="0" stop-color="#FFFFFF"/>
      <stop offset="1" stop-color="#EDE6DE"/>
    </radialGradient>
    <filter id="lSoft" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#7A4A20" flood-opacity=".22"/>
    </filter>
  </defs>

  <!-- ground shadow -->
  <ellipse class="l-shadow" cx="160" cy="384" rx="74" ry="9" fill="#5A3518" opacity=".16"/>

  <g class="l-body" filter="url(#lSoft)">
    <!-- legs -->
    <g stroke="#3A2416" stroke-width="5" stroke-linejoin="round">
      <rect x="130" y="336" width="20" height="44" rx="9" fill="#6B4630"/>
      <rect x="170" y="336" width="20" height="44" rx="9" fill="#6B4630"/>
      <path d="M128 372 h24 v8 a5 5 0 0 1 -5 5 h-14 a5 5 0 0 1 -5 -5z" fill="#3A2416"/>
      <path d="M168 372 h24 v8 a5 5 0 0 1 -5 5 h-14 a5 5 0 0 1 -5 -5z" fill="#3A2416"/>
    </g>
    <!-- hoodie -->
    <g stroke="#3A2416" stroke-width="5" stroke-linejoin="round" stroke-linecap="round">
      <ellipse cx="104" cy="322" rx="16" ry="22" fill="url(#lHood)" transform="rotate(14 104 322)"/>
      <ellipse cx="216" cy="322" rx="16" ry="22" fill="url(#lHood)" transform="rotate(-14 216 322)"/>
      <path d="M106 292 Q160 266 214 292 L222 346 Q160 364 98 346 Z" fill="url(#lHood)"/>
      <path d="M116 292 Q160 318 204 292 Q198 276 160 279 Q122 276 116 292 Z" fill="#E07A12"/>
      <path d="M134 328 Q160 336 186 328" fill="none" stroke-width="4"/>
      <path d="M150 300 L148 324" fill="none" stroke-width="3.5"/>
      <path d="M170 300 L172 324" fill="none" stroke-width="3.5"/>
      <circle cx="148" cy="327" r="3.5" fill="#FFF3E2" stroke-width="2.5"/>
      <circle cx="172" cy="327" r="3.5" fill="#FFF3E2" stroke-width="2.5"/>
    </g>
    <path d="M120 300 Q140 290 160 292" fill="none" stroke="#FFD89A" stroke-width="4" stroke-linecap="round" opacity=".7"/>
  </g>

  <!-- neck wool (outline pass, then fill pass) -->
  <g class="l-neck">
    <g fill="#3A2416">
      <circle cx="160" cy="282" r="30"/><circle cx="146" cy="258" r="30"/><circle cx="174" cy="250" r="30"/>
      <circle cx="152" cy="228" r="32"/><circle cx="172" cy="222" r="30"/><circle cx="138" cy="276" r="22"/><circle cx="184" cy="276" r="22"/>
    </g>
    <g fill="url(#lwNeck)">
      <circle cx="160" cy="282" r="25.5"/><circle cx="146" cy="258" r="25.5"/><circle cx="174" cy="250" r="25.5"/>
      <circle cx="152" cy="228" r="27.5"/><circle cx="172" cy="222" r="25.5"/><circle cx="138" cy="276" r="17.5"/><circle cx="184" cy="276" r="17.5"/>
    </g>
    <path d="M140 250 q6 -6 12 0 M166 268 q6 -6 12 0 M150 284 q5 -5 10 0" fill="none" stroke="#D99F6C" stroke-width="3" stroke-linecap="round"/>
  </g>

  <ellipse cx="160" cy="240" rx="52" ry="14" fill="#7A4A20" opacity=".22"/>
  <!-- head: everything that tilts -->
  <g class="l-head">
    <!-- ears -->
    <g class="l-ear l-ear-l">
      <path d="M118 112 C 92 70 96 26 112 14 C 134 28 142 74 136 112 Z" fill="url(#lEar)" stroke="#3A2416" stroke-width="5" stroke-linejoin="round"/>
      <path d="M121 100 C 106 70 108 42 115 32 C 127 46 131 76 128 100 Z" fill="url(#lEarIn)"/>
    </g>
    <g class="l-ear l-ear-r">
      <path d="M202 112 C 228 70 224 26 208 14 C 186 28 178 74 184 112 Z" fill="url(#lEar)" stroke="#3A2416" stroke-width="5" stroke-linejoin="round"/>
      <path d="M199 100 C 214 70 212 42 205 32 C 193 46 189 76 192 100 Z" fill="url(#lEarIn)"/>
    </g>

    <!-- wool head: outline pass -->
    <g fill="#3A2416">
      <circle cx="160" cy="160" r="72"/>
      <circle cx="108" cy="122" r="30"/><circle cx="134" cy="96" r="30"/><circle cx="164" cy="88" r="30"/><circle cx="194" cy="98" r="30"/>
      <circle cx="216" cy="126" r="28"/><circle cx="224" cy="160" r="28"/><circle cx="214" cy="192" r="28"/><circle cx="190" cy="214" r="28"/>
      <circle cx="160" cy="222" r="30"/><circle cx="128" cy="214" r="28"/><circle cx="104" cy="190" r="28"/><circle cx="96" cy="156" r="28"/>
      <circle cx="146" cy="76" r="22"/><circle cx="176" cy="72" r="22"/>
    </g>
    <!-- wool head: fill pass with one continuous gradient -->
    <g fill="url(#lwHead)">
      <circle cx="160" cy="160" r="67.5"/>
      <circle cx="108" cy="122" r="25.5"/><circle cx="134" cy="96" r="25.5"/><circle cx="164" cy="88" r="25.5"/><circle cx="194" cy="98" r="25.5"/>
      <circle cx="216" cy="126" r="23.5"/><circle cx="224" cy="160" r="23.5"/><circle cx="214" cy="192" r="23.5"/><circle cx="190" cy="214" r="23.5"/>
      <circle cx="160" cy="222" r="25.5"/><circle cx="128" cy="214" r="23.5"/><circle cx="104" cy="190" r="23.5"/><circle cx="96" cy="156" r="23.5"/>
      <circle cx="146" cy="76" r="17.5"/><circle cx="176" cy="72" r="17.5"/>
    </g>
    <!-- curls + specular -->
    <path d="M120 104 q8 -8 16 0 M156 80 q8 -8 16 0 M196 112 q8 -8 16 0 M100 170 q7 -7 14 0 M206 196 q7 -7 14 0 M140 222 q7 -7 14 0" fill="none" stroke="#DDA572" stroke-width="3" stroke-linecap="round"/>
    <ellipse cx="128" cy="104" rx="22" ry="12" fill="#FFFFFF" opacity=".55" transform="rotate(-24 128 104)"/>

    <!-- snout -->
    <ellipse cx="164" cy="194" rx="40" ry="28" fill="url(#lSnout)" stroke="#3A2416" stroke-width="4.5"/>
    <ellipse cx="152" cy="184" rx="14" ry="6" fill="#FFFFFF" opacity=".7"/>
    <path d="M150 182 q4 5 9 2 M170 184 q5 3 9 -2" fill="none" stroke="#3A2416" stroke-width="4" stroke-linecap="round"/>

    <!-- ===== IDLE: half-lidded, round glasses, chewing grass ===== -->
    <g class="st st-idle">
      <g class="l-blink">
        <circle cx="128" cy="148" r="19" fill="url(#lEye)" stroke="#3A2416" stroke-width="4"/>
        <circle cx="194" cy="148" r="19" fill="url(#lEye)" stroke="#3A2416" stroke-width="4"/>
        <circle class="l-pupil" cx="129" cy="154" r="8.5" fill="#1E140D"/><circle cx="132" cy="151" r="2.6" fill="#fff"/>
        <circle class="l-pupil" cx="195" cy="154" r="8.5" fill="#1E140D"/><circle cx="198" cy="151" r="2.6" fill="#fff"/>
        <path d="M108.5 145 Q128 124 147.5 145 Z" fill="#F7D3AC" stroke="#3A2416" stroke-width="4" stroke-linejoin="round"/>
        <path d="M174.5 145 Q194 124 213.5 145 Z" fill="#F7D3AC" stroke="#3A2416" stroke-width="4" stroke-linejoin="round"/>
      </g>
      <g fill="none" stroke="#2A1A10" stroke-width="4.5">
        <rect x="102" y="126" width="52" height="42" rx="16" fill="#BFE6FF" fill-opacity=".14"/>
        <rect x="168" y="126" width="52" height="42" rx="16" fill="#BFE6FF" fill-opacity=".14"/>
        <path d="M152 140 Q161 134 170 140"/>
        <path d="M104 138 L88 132 M218 138 L232 132" stroke-linecap="round"/>
      </g>
      <path d="M110 134 l10 -3" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".8"/>
      <path d="M148 206 Q162 214 178 204" fill="none" stroke="#3A2416" stroke-width="4" stroke-linecap="round"/>
      <g class="l-grass" stroke="#3A2416" stroke-width="2.5" stroke-linejoin="round">
        <path d="M176 205 L222 226 L218 232 Z" fill="#E7C33A"/>
        <path d="M206 218 L228 210 L214 222 Z" fill="#CFE05A"/>
      </g>
    </g>

    <!-- ===== LISTENING: squint, side-eye, ear swivelled toward you ===== -->
    <g class="st st-listen">
      <path d="M110 150 Q128 140 146 150" fill="none" stroke="#3A2416" stroke-width="5" stroke-linecap="round"/>
      <path d="M110 132 L146 140" stroke="#3A2416" stroke-width="5" stroke-linecap="round"/>
      <circle cx="194" cy="150" r="19" fill="url(#lEye)" stroke="#3A2416" stroke-width="4"/>
      <circle cx="184" cy="152" r="7.5" fill="#1E140D"/><circle cx="186" cy="149" r="2.2" fill="#fff"/>
      <path d="M174 128 Q194 118 214 130" fill="none" stroke="#3A2416" stroke-width="5" stroke-linecap="round"/>
      <path d="M150 206 Q164 204 176 208" fill="none" stroke="#3A2416" stroke-width="4" stroke-linecap="round"/>
      <g stroke="#3A2416" stroke-width="2.5" stroke-linejoin="round">
        <path d="M176 207 L222 222 L219 229 Z" fill="#E7C33A"/>
      </g>
      <g class="l-ticks" stroke="#2A1A10" stroke-width="5" stroke-linecap="round">
        <path d="M276 58 l-8 18"/><path d="M296 84 l-16 10"/><path d="M302 114 l-18 2"/>
      </g>
    </g>

    <!-- ===== OK: sunglasses, smug grin, sparkle ===== -->
    <g class="st st-ok">
      <path d="M100 136 Q102 128 112 128 L150 130 Q156 132 154 140 L150 156 Q146 168 130 168 Q108 168 102 152 Z" fill="url(#lShade)" stroke="#111" stroke-width="3"/>
      <path d="M170 132 L210 128 Q222 128 222 138 L218 154 Q212 168 192 168 Q176 168 172 156 L168 140 Q168 133 170 132 Z" fill="url(#lShade)" stroke="#111" stroke-width="3"/>
      <path d="M152 138 Q161 132 170 138" fill="none" stroke="#111" stroke-width="5"/>
      <path d="M100 138 L84 134 M222 136 L238 130" stroke="#111" stroke-width="5" stroke-linecap="round"/>
      <path d="M112 140 l18 -6 M182 140 l18 -6" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".55"/>
      <path d="M144 204 Q164 222 188 200" fill="#7A2E1E" stroke="#3A2416" stroke-width="4" stroke-linejoin="round"/>
      <path d="M150 206 Q164 214 182 204" fill="#fff"/>
      <path class="l-spark" d="M262 150 l6 -18 l6 18 l18 6 l-18 6 l-6 18 l-6 -18 l-18 -6 z" fill="#FFD23A" stroke="#3A2416" stroke-width="3" stroke-linejoin="round"/>
      <g class="l-ticks" stroke="#FFC21A" stroke-width="6" stroke-linecap="round">
        <path d="M70 70 l10 16"/><path d="M48 96 l18 8"/><path d="M92 54 l2 18"/>
      </g>
    </g>

    <!-- ===== FAKE: furious, yelling, steaming ===== -->
    <g class="st st-fake">
      <circle cx="128" cy="152" r="17" fill="url(#lEye)" stroke="#3A2416" stroke-width="4"/>
      <circle cx="194" cy="152" r="17" fill="url(#lEye)" stroke="#3A2416" stroke-width="4"/>
      <circle cx="134" cy="156" r="6" fill="#1E140D"/><circle cx="188" cy="156" r="6" fill="#1E140D"/>
      <path d="M106 132 L150 146" stroke="#3A2416" stroke-width="8" stroke-linecap="round"/>
      <path d="M216 132 L172 146" stroke="#3A2416" stroke-width="8" stroke-linecap="round"/>
      <g fill="none" stroke="#2A1A10" stroke-width="4.5">
        <rect x="104" y="132" width="48" height="38" rx="15"/>
        <rect x="170" y="132" width="48" height="38" rx="15"/>
        <path d="M152 144 Q161 138 170 144"/>
      </g>
      <path d="M140 200 Q164 186 190 200 Q194 232 164 236 Q136 232 140 200 Z" fill="#8E2A1C" stroke="#3A2416" stroke-width="4.5" stroke-linejoin="round"/>
      <path d="M148 222 Q164 210 182 222 Q178 232 164 233 Q150 232 148 222 Z" fill="#F57E7E"/>
      <path d="M146 202 Q164 196 184 202 L182 208 Q164 203 148 208 Z" fill="#fff"/>
      <g class="l-vein" stroke="#E0262B" stroke-width="6" stroke-linecap="round" fill="none">
        <path d="M222 104 q8 6 0 12"/><path d="M236 98 q-6 8 -12 0"/><path d="M240 114 q-8 -6 0 -12"/><path d="M226 120 q6 -8 12 0"/>
      </g>
      <g class="l-puff">
        <g fill="#3A2416"><circle cx="58" cy="176" r="15"/><circle cx="74" cy="164" r="17"/><circle cx="76" cy="184" r="13"/><circle cx="44" cy="190" r="10"/></g>
        <g fill="#FFFFFF"><circle cx="58" cy="176" r="11"/><circle cx="74" cy="164" r="13"/><circle cx="76" cy="184" r="9"/><circle cx="44" cy="190" r="6.5"/></g>
      </g>
      <g class="l-puff">
        <g fill="#3A2416"><circle cx="262" cy="196" r="15"/><circle cx="246" cy="184" r="17"/><circle cx="244" cy="204" r="13"/><circle cx="276" cy="210" r="10"/></g>
        <g fill="#FFFFFF"><circle cx="262" cy="196" r="11"/><circle cx="246" cy="184" r="13"/><circle cx="244" cy="204" r="9"/><circle cx="276" cy="210" r="6.5"/></g>
      </g>
    </g>
  </g>
</svg>`;
