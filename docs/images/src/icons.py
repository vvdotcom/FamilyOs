"""Simple white glyphs drawn on a 64x64 tile (origin top-left of the tile)."""
def g(kind):
    W = 'fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"'
    F = 'fill="#fff"'
    return {
        'bedrock': f'<circle cx="32" cy="32" r="5" {F}/>' + ''.join(f'<circle cx="{x}" cy="{y}" r="4" {F}/><line x1="32" y1="32" x2="{x}" y2="{y}" {W}/>' for x, y in [(16,18),(48,18),(14,40),(50,40),(32,52)]),
        'memory': f'<rect x="18" y="16" width="28" height="32" rx="3" {W}/>' + ''.join(f'<line x1="{x}" y1="10" x2="{x}" y2="16" {W}/><line x1="{x}" y1="48" x2="{x}" y2="54" {W}/>' for x in (24,32,40)) + f'<path d="M25 34c0-5 3-8 7-8s7 3 7 8" {W}/><circle cx="32" cy="36" r="2.5" {F}/>',
        'cognito': f'<circle cx="28" cy="24" r="8" {W}/><path d="M14 50c1-9 7-14 14-14 4 0 7 1 9 3" {W}/><circle cx="44" cy="44" r="5" {W}/><path d="M48 47l6 6M52 51l2-2" {W}/>',
        'secrets': f'<rect x="18" y="30" width="28" height="22" rx="3" {W}/><path d="M24 30v-6a8 8 0 0 1 16 0v6" {W}/><circle cx="32" cy="40" r="3" {F}/><line x1="32" y1="42" x2="32" y2="46" {W}/>',
        'iam': f'<path d="M32 12l16 6v12c0 11-7 19-16 22-9-3-16-11-16-22V18z" {W}/><path d="M25 32l5 5 9-10" {W}/>',
        'cfn': f'<path d="M32 14l18 9-18 9-18-9z" {W}/><path d="M14 32l18 9 18-9" {W}/><path d="M14 41l18 9 18-9" {W}/>',
        'ec2': f'<rect x="20" y="20" width="24" height="24" rx="2" {W}/>' + ''.join(f'<line x1="{a}" y1="{b}" x2="{c}" y2="{d}" {W}/>' for a,b,c,d in [(26,14,26,20),(32,14,32,20),(38,14,38,20),(26,44,26,50),(32,44,32,50),(38,44,38,50),(14,26,20,26),(14,32,20,32),(14,38,20,38),(44,26,50,26),(44,32,50,32),(44,38,50,38)]),
        'api': f'<rect x="12" y="16" width="40" height="32" rx="4" {W}/><path d="M24 28l-5 4 5 4M40 28l5 4-5 4M34 26l-4 12" {W}/>',
        'mcp': f'<circle cx="20" cy="32" r="6" {W}/><circle cx="44" cy="20" r="6" {W}/><circle cx="44" cy="44" r="6" {W}/><path d="M26 30l12-7M26 34l12 7" {W}/>',
        'agent': f'<rect x="16" y="20" width="32" height="26" rx="8" {W}/><circle cx="26" cy="33" r="3" {F}/><circle cx="38" cy="33" r="3" {F}/><line x1="32" y1="12" x2="32" y2="20" {W}/><circle cx="32" cy="11" r="3" {F}/>',
        'rhythm': f'<path d="M10 38q5.5-8 11 0t11 0 11 0 11 0" {W}/><path d="M10 47q5.5-8 11 0t11 0 11 0 11 0" {W}/><circle cx="32" cy="22" r="7" {F}/>',
        'db': f'<ellipse cx="32" cy="18" rx="16" ry="6" {W}/><path d="M16 18v28c0 3.3 7.2 6 16 6s16-2.7 16-6V18" {W}/><path d="M16 32c0 3.3 7.2 6 16 6s16-2.7 16-6" {W}/>',
        'sync': f'<path d="M46 26a15 15 0 0 0-27-4" {W}/><path d="M18 14v8h8" {W}/><path d="M18 38a15 15 0 0 0 27 4" {W}/><path d="M46 50v-8h-8" {W}/>',
        'skill': f'<circle cx="32" cy="32" r="18" {W}/><path d="M24 40c0-7 3-15 8-15s8 8 8 15" {W}/><path d="M26 33h12" {W}/>',
        'alexa': ''.join(f'<line x1="{x}" y1="{32-h}" x2="{x}" y2="{32+h}" {W}/>' for x, h in [(14,4),(20,9),(26,15),(32,19),(38,13),(44,8),(50,4)]),
    }[kind]

# Device outline icons (dark, AWS "general" style), drawn in a 72x72 box
def dev(kind, c='#232F3E'):
    W = f'fill="none" stroke="{c}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"'
    return {
        'tv': f'<rect x="6" y="12" width="60" height="38" rx="4" {W}/><line x1="26" y1="60" x2="46" y2="60" {W}/><line x1="36" y1="50" x2="36" y2="60" {W}/>',
        'phone': f'<rect x="10" y="10" width="26" height="48" rx="5" {W}/><line x1="20" y1="52" x2="26" y2="52" {W}/><rect x="40" y="18" width="26" height="34" rx="3" {W}/>',
        'echo': f'<path d="M20 18h32v38a4 4 0 0 1-4 4H24a4 4 0 0 1-4-4z" {W}/><ellipse cx="36" cy="18" rx="16" ry="5" {W}/><path d="M26 30h20M26 37h20M26 44h20" {W}/>',
        'calendar': f'<rect x="10" y="14" width="52" height="46" rx="4" {W}/><line x1="10" y1="26" x2="62" y2="26" {W}/><line x1="24" y1="8" x2="24" y2="18" {W}/><line x1="48" y1="8" x2="48" y2="18" {W}/><path d="M20 36h8M32 36h8M44 36h8M20 46h8M32 46h8" {W}/>',
        'remote': f'<rect x="26" y="6" width="20" height="60" rx="8" {W}/><circle cx="36" cy="22" r="5" {W}/><path d="M32 38h8M32 46h8M32 54h8" {W}/>',
    }[kind]
