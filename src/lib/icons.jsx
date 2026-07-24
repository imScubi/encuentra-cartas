// Set de iconos propio de Encuentra Cartas (reemplaza lucide-react).
// Generado a partir de los SVG de src/assets/icons/ -- cada componente
// expone la misma API que usaba lucide-react (size, color, fill, className,
// style, ...) para que el reemplazo en App.jsx sea un simple cambio de
// import, sin tocar cada uso.
//
// stroke="currentColor" a propósito: así el color lo decide quien use el
// icono (COLORS.xxx vía prop color, o CSS), lo que deja que el mismo SVG
// se vea bien en modo día/noche y con cualquiera de los 18 tintes de tipo
// de Pokémon que recolorea el acento en tiempo real (ver theme.js).
import React from "react";

function crearIcono(nombre, innerSvg) {
  const Icono = React.forwardRef(function Icono(
    { size = 24, color = "currentColor", fill = "none", strokeWidth = 1.8, className, style, ...props },
    ref
  ) {
    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={fill}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        style={style}
        dangerouslySetInnerHTML={{ __html: innerSvg }}
        {...props}
      />
    );
  });
  Icono.displayName = nombre;
  return Icono;
}

export const Search = crearIcono("Search", `<circle cx="10.5" cy="10.5" r="6.5"></circle><path d="M20 20l-4.7-4.7"></path>`);
export const MapPin = crearIcono("MapPin", `<path d="M12 21s7-6.3 7-11.5a7 7 0 1 0-14 0C5 14.7 12 21 12 21Z"></path><circle cx="12" cy="9.5" r="2.4"></circle>`);
export const Phone = crearIcono("Phone", `<path d="M6.6 3.5h2.6l1.4 4.4-2 1.7a12.5 12.5 0 0 0 6 6l1.7-2 4.4 1.4v2.6a1.7 1.7 0 0 1-1.9 1.7A16.8 16.8 0 0 1 4.9 5.4a1.7 1.7 0 0 1 1.7-1.9Z"></path>`);
export const Store = crearIcono("Store", `<path d="M4 9l1.2-4.2A1 1 0 0 1 6.15 4h11.7a1 1 0 0 1 .95.68L20 9"></path><path d="M4 9h16v2.2a2.3 2.3 0 0 1-4.4.9 2.3 2.3 0 0 1-4.2 0 2.3 2.3 0 0 1-4.2 0A2.3 2.3 0 0 1 4 11.2Z"></path><path d="M6 12.5V20h12v-7.5"></path><path d="M10 20v-5h4v5"></path>`);
export const Sparkles = crearIcono("Sparkles", `<path d="M11 3 12.3 8 17 9.3 12.3 10.6 11 15.5 9.7 10.6 5 9.3 9.7 8Z"></path><path d="M18 14 18.7 16.3 21 17 18.7 17.7 18 20 17.3 17.7 15 17 17.3 16.3Z"></path>`);
export const Package = crearIcono("Package", `<path d="M12 3 20 7.2v9.6L12 21 4 16.8V7.2Z"></path><path d="M4 7.2 12 11l8-3.8"></path><path d="M12 11v10"></path><path d="M8 5.2 16 9"></path>`);
export const ChevronLeft = crearIcono("ChevronLeft", `<path d="M15 5l-7 7 7 7"></path>`);
export const User = crearIcono("User", `<circle cx="12" cy="8" r="3.6"></circle><path d="M5 20c0-3.6 3.1-6.2 7-6.2s7 2.6 7 6.2"></path>`);
export const Megaphone = crearIcono("Megaphone", `<path d="M4 11v2a1.5 1.5 0 0 0 1.5 1.5H7l1.3 4.4a1 1 0 0 0 1.9-.3L10 14.5"></path><path d="M4 11l11.5-5A1 1 0 0 1 17 7v10a1 1 0 0 1-1.5.9L4 13Z"></path><path d="M19 9.5a3 3 0 0 1 0 5"></path>`);
export const Newspaper = crearIcono("Newspaper", `<path d="M5 4.5h11a1.5 1.5 0 0 1 1.5 1.5v12A1.5 1.5 0 0 1 19 16.5h-1.5"></path><rect x="3.5" y="7" width="12.5" height="12.5" rx="1.5"></rect><path d="M6 10h6.5"></path><path d="M6 13h6.5"></path><path d="M6 16h4"></path>`);
export const ShoppingBag = crearIcono("ShoppingBag", `<path d="M6.5 8H17.5L18.5 20a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 20Z"></path><path d="M9 8V6.5a3 3 0 0 1 6 0V8"></path>`);
export const ShoppingCart = crearIcono("ShoppingCart", `<circle cx="9.5" cy="20" r="1.3"></circle><circle cx="17.5" cy="20" r="1.3"></circle><path d="M3 4h2l2.2 11.1A1.5 1.5 0 0 0 8.7 16.3h9.1a1.5 1.5 0 0 0 1.5-1.2L20.5 8H6"></path>`);
export const X = crearIcono("X", `<path d="M6 6l12 12"></path><path d="M18 6L6 18"></path>`);
export const Loader2 = crearIcono("Loader2", `<path d="M12 3v4"></path><path d="M12 17v4"></path><path d="M5.2 5.2l2.8 2.8"></path><path d="M16 16l2.8 2.8"></path><path d="M3 12h4"></path><path d="M17 12h4"></path><path d="M5.2 18.8l2.8-2.8"></path><path d="M16 8l2.8-2.8"></path>`);
export const AlertCircle = crearIcono("AlertCircle", `<circle cx="12" cy="12" r="8.5"></circle><path d="M12 8v5"></path><path d="M12 16.2h.01"></path>`);
export const MessageCircle = crearIcono("MessageCircle", `<path d="M20 12a8 8 0 1 1-3.4-6.5"></path><path d="M20 12a8 8 0 0 1-11.3 7.3L4 20l1.3-4.4"></path>`);
export const Send = crearIcono("Send", `<path d="M4 4l16 8-16 8 3.5-8Z"></path><path d="M7.5 12H15"></path>`);
export const ExternalLink = crearIcono("ExternalLink", `<path d="M9 6H5.5A1.5 1.5 0 0 0 4 7.5v11A1.5 1.5 0 0 0 5.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15"></path><path d="M14 4h6v6"></path><path d="M20 4 11 13"></path>`);
export const Shield = crearIcono("Shield", `<path d="M12 3.5 19 6.3v5.4c0 4.5-2.9 7.7-7 8.8-4.1-1.1-7-4.3-7-8.8V6.3Z"></path><path d="M9 12l2 2 4-4.2"></path>`);
export const Receipt = crearIcono("Receipt", `<path d="M6 3.5h12v17l-2.2-1.4-2 1.4-1.8-1.4-2 1.4-1.8-1.4-2 1.4Z"></path><path d="M8.5 8h7"></path><path d="M8.5 11.3h7"></path><path d="M8.5 14.6h4.5"></path>`);
export const Menu = crearIcono("Menu", `<path d="M4 6.5h16"></path><path d="M4 12h16"></path><path d="M4 17.5h16"></path>`);
export const Bell = crearIcono("Bell", `<path d="M6 10.5a6 6 0 0 1 12 0c0 3.4 1 5 2 6H4c1-1 2-2.6 2-6Z"></path><path d="M9.7 19.5a2.3 2.3 0 0 0 4.6 0"></path>`);
export const HelpCircle = crearIcono("HelpCircle", `<circle cx="12" cy="12" r="8.5"></circle><path d="M9.5 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.3 1.9-2.3 3.6"></path><path d="M12 17.2h.01"></path>`);
export const Calendar = crearIcono("Calendar", `<rect x="3.5" y="5" width="17" height="16" rx="2"></rect><path d="M3.5 10h17"></path><path d="M8 3v4"></path><path d="M16 3v4"></path><path d="M8.3 14.3h.01"></path><path d="M12 14.3h.01"></path><path d="M15.7 14.3h.01"></path><path d="M8.3 17.5h.01"></path><path d="M12 17.5h.01"></path>`);
export const Star = crearIcono("Star", `<path d="M12 3.5 14.5 9l6 .9-4.3 4.2 1 6-5.2-2.8-5.2 2.8 1-6L3.5 9.9l6-.9Z"></path>`);
export const Layers = crearIcono("Layers", `<path d="M12 3.5 20.5 8 12 12.5 3.5 8Z"></path><path d="M3.5 12 12 16.5 20.5 12"></path><path d="M3.5 16 12 20.5 20.5 16"></path>`);
export const Palette = crearIcono("Palette", `<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 2-1 2-2.1 0-.6-.2-1-.5-1.4-.3-.4-.5-.8-.5-1.4 0-1.1.9-2 2-2H17a3.5 3.5 0 0 0 3.5-3.5C20.5 6.5 16.7 3.5 12 3.5Z"></path><circle cx="7.3" cy="10" r="1.1"></circle><circle cx="9.8" cy="7" r="1.1"></circle><circle cx="14.4" cy="7" r="1.1"></circle><circle cx="16.8" cy="10.3" r="1.1"></circle>`);
export const ArrowUp = crearIcono("ArrowUp", `<path d="M12 19V5"></path><path d="M6 11l6-6 6 6"></path>`);
export const ArrowDown = crearIcono("ArrowDown", `<path d="M12 5v14"></path><path d="M18 13l-6 6-6-6"></path>`);
export const Navigation = crearIcono("Navigation", `<path d="M12 3 19.5 19.5 12 16 4.5 19.5Z"></path>`);
export const ImageIcon = crearIcono("ImageIcon", `<rect x="3.5" y="4.5" width="17" height="15" rx="2"></rect><circle cx="9" cy="10" r="1.6"></circle><path d="M4 17l5-5 4 4 3-3 4 4"></path>`);
export const Trash2 = crearIcono("Trash2", `<path d="M5 7h14"></path><path d="M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7"></path><path d="M7.5 7 8.3 19a1.5 1.5 0 0 0 1.5 1.4h4.4a1.5 1.5 0 0 0 1.5-1.4L16.5 7"></path><path d="M10.5 11v6"></path><path d="M13.5 11v6"></path>`);
export const ChevronDown = crearIcono("ChevronDown", `<path d="M5 9l7 7 7-7"></path>`);
export const ChevronUp = crearIcono("ChevronUp", `<path d="M5 15l7-7 7 7"></path>`);
export const Tag = crearIcono("Tag", `<path d="M12.6 3.5H8a1.5 1.5 0 0 0-1.06.44L3.5 7.4a1.5 1.5 0 0 0 0 2.12l9 9a1.5 1.5 0 0 0 2.12 0l6.44-6.44a1.5 1.5 0 0 0 0-2.12l-6.4-6.4a1.5 1.5 0 0 0-.06-.06Z"></path><circle cx="9.5" cy="9.5" r="1.4"></circle>`);
export const Copy = crearIcono("Copy", `<rect x="9" y="9" width="11" height="11" rx="1.8"></rect><path d="M6 15H5.5A1.5 1.5 0 0 1 4 13.5v-8A1.5 1.5 0 0 1 5.5 4h8A1.5 1.5 0 0 1 15 5.5V6"></path>`);
export const Check = crearIcono("Check", `<path d="M5 12.5l4.5 4.5L19 7"></path>`);
export const BookOpen = crearIcono("BookOpen", `<path d="M12 6.5c-1.6-1.3-3.6-2-6.5-2-.6 0-1 .4-1 1V17c0 .6.4 1 1 1 2.9 0 4.9.7 6.5 2 1.6-1.3 3.6-2 6.5-2 .6 0 1-.4 1-1V5.5c0-.6-.4-1-1-1-2.9 0-4.9.7-6.5 2Z"></path><path d="M12 6.5V19.5"></path>`);
export const Gift = crearIcono("Gift", `<rect x="3.5" y="8" width="17" height="4" rx="1"></rect><path d="M12 8v12.5"></path><path d="M18.5 12v6.5a1.5 1.5 0 0 1-1.5 1.5H7a1.5 1.5 0 0 1-1.5-1.5V12"></path><path d="M7.8 8a2.3 2.3 0 1 1 0-4.6C10.8 3.4 12 8 12 8"></path><path d="M16.2 8a2.3 2.3 0 1 0 0-4.6C13.2 3.4 12 8 12 8"></path>`);
export const Gavel = crearIcono("Gavel", `<path d="m9.5 7.5 7 7"></path><path d="M12.7 4.3 17.7 9.3"></path><rect x="7.5" y="8.7" width="4" height="9" rx="1" transform="rotate(-45 9.5 13.2)"></rect><path d="m6 17.5-2.5 2.5"></path><path d="M3 21h7"></path>`);
