// Minimal stub for image-slot used by the standalone HTML
// This file intentionally provides a no-op implementation so images referenced
// by the template can be loaded if present in relative paths.
(function(){
  window.ImageSlot = {
    resolve: (src)=> src
  };
})();
