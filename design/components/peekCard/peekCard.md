# peekCard

A collapsed sheet layer on wide layouts: a floating card centred on the content, at most 500px wide.

A surface (extends `surface`): tappable through the inherited `press` event.

Unlike other surfaces it answers the pointer: hover and pressed state layer, ripple and a hand cursor (the look it had as a row). The peek of a sheet layer uses this look in both forms (the compact peek on the bottom sheet, the wide floating card).
