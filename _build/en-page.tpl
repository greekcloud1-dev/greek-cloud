<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">

<title>{{TITLE}}</title>
<meta name="description" content="{{DESC}}">
<meta name="robots" content="{{ROBOTS}}">
<meta name="theme-color" content="#5E7350">
<link rel="canonical" href="https://www.greekcloud.co.il/en/{{SLUG}}">
<link rel="alternate" hreflang="he" href="https://www.greekcloud.co.il/{{HESLUG}}">
<link rel="alternate" hreflang="en" href="https://www.greekcloud.co.il/en/{{SLUG}}">
<link rel="alternate" hreflang="x-default" href="https://www.greekcloud.co.il/{{HESLUG}}">

<meta property="og:type" content="{{OGTYPE}}">
<meta property="og:locale" content="en_US">
<meta property="og:locale:alternate" content="he_IL">
<meta property="og:site_name" content="GreekCloud">
<meta property="og:title" content="{{OGTITLE}}">
<meta property="og:description" content="{{DESC}}">
<meta property="og:url" content="https://www.greekcloud.co.il/en/{{SLUG}}">
<meta property="og:image" content="https://www.greekcloud.co.il/assets/og-en.png">
<meta name="twitter:card" content="summary_large_image">

<link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/assets/favicon-16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/assets/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Amatic+SC:wght@700&family=Suez+One&family=Assistant:wght@400;600;700;800&display=swap">
<link rel="stylesheet" href="/assets/base.css">
<link rel="stylesheet" href="/assets/settings.css">
<link rel="stylesheet" href="/assets/a11y-widget.css">
<link rel="stylesheet" href="/assets/doc.css">
{{EXTRACSS}}
<script>
(function(){var d=document.documentElement;d.classList.add('has-anim');
try{var t=localStorage.getItem('gc-theme');if(t==='dark'||t==='light')d.setAttribute('data-theme',t);}catch(e){}
try{var p=JSON.parse(localStorage.getItem('gc-a11y'))||{};var c=d.classList;
if(p.text)c.add('a11y-text-'+p.text);
if(p.lines)c.add('a11y-lines-'+p.lines);
if(p.contrast)c.add('a11y-contrast-'+p.contrast);
if(p.links)c.add('a11y-links');if(p.font)c.add('a11y-font');
if(p.headings)c.add('a11y-headings');if(p.cursor)c.add('a11y-cursor-big');
if(p.motion)c.add('a11y-motion');}catch(e){}})();
</script>
<script src="/assets/anim.js" defer></script>
<script src="/assets/settings.js" defer></script>
<script src="/assets/a11y-widget.js" defer></script>
<script src="/assets/notice.js" defer></script>
{{EXTRAJS}}
<script type="application/ld+json">
{{SCHEMA}}
</script>
</head>

<body>
<a class="skip" href="#main">Skip to main content</a>

{{HEADER}}

<main id="main" tabindex="-1">
{{CONTENT}}
</main>

{{FOOTER}}

</body>
</html>