# gridLayout

Responsive grid: as many columns as fit at minColumnWidth (at most maxColumns), each stretching to fill the row; items keep itemAspect (width / height). Platforms compute the columns from the width they have (web: repeat(auto-fill, minmax(min, 1fr)); Android: adaptive lazy grid).
