# sideSheet

Wide form of a sheet layer: beside the content when there is room, otherwise modal (touch) or auto-collapsing (pointer).

A surface (extends `surface`): tappable through the inherited `press` event.

Part `handle` (visuals `handle*`): the tab at the end edge, vertically centred, shown while the sheet is auto-collapsing and closed; pointing at it or tapping it sends the sheet layer's `open`. It is drawn by the sheet's DC (NowPlayingSheet), from the sheetLayer node.
