// ========================================
// Variant 1: Solid Black Uppercase Category Buttons
// ========================================
// Description: This variant transforms the category name text overlays within the image slider into visually distinct, solid rectangular buttons. Each button has a solid black background (#000000), features uppercase text in the brand's accent gold color (#f4a70e), and uses the 'Poppins' font. On hover, the button's background subtly shifts to a darker gray (#222222) and lifts upwards slightly with a smooth animation, enhancing interactivity.
// Target Selector: div.shopbrand .item h3
// Execution Timing: dom_ready
// ========================================

(function() {
    'use strict';

    function initVariant() {
        try {
            const variantStyleId = 'variant-pro-category-buttons';
            if (document.getElementById(variantStyleId)) {
                return; // Prevent re-injection
            }

            const selector = 'div.shopbrand .item'; // Target the parent for better context
            const elements = document.querySelectorAll(selector);

            if (!elements.length) {
                console.warn('Variant "Pro Category Buttons": Target elements not found using selector:', selector);
                return;
            }

            // Define a professional CSS implementation
            const css = `
                :root {
                    --btn-bg: #000000;
                    --btn-text: #f4a70e;
                    --btn-hover-bg: #1a1a1a;
                    --btn-font-family: 'Poppins', sans-serif;
                    --btn-font-size: 14px;
                    --btn-font-weight: 700;
                    --btn-padding: 15px 24px;
                    --btn-margin: 16px 0;
                    --btn-transition-duration: 0.3s;
                    --btn-easing: cubic-bezier(0.25, 0.8, 0.25, 1);
                    --btn-shadow: 0 2px 5px rgba(0, 0, 0, 0.1), 0 1px 3px rgba(0, 0, 0, 0.08);
                    --btn-hover-shadow: 0 6px 12px rgba(0, 0, 0, 0.15), 0 3px 6px rgba(0, 0, 0, 0.1);
                    --btn-active-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
                }

                /* Parent anchor setup for interaction and layout */
                ${selector} a {
                    text-decoration: none !important;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    -webkit-tap-highlight-color: transparent; /* Remove tap flash on mobile */
                }
                
                /* Core button styles applied to the H3 element */
                ${selector} h3 {
                    background-color: var(--btn-bg);
                    color: var(--btn-text);
                    font-family: var(--btn-font-family);
                    font-size: var(--btn-font-size);
                    font-weight: var(--btn-font-weight);
                    text-transform: uppercase;
                    letter-spacing: 0.05em; /* Add slight letter spacing for uppercase text */
                    padding: var(--btn-padding);
                    margin: var(--btn-margin) !important;
                    border-radius: 0px;
                    box-shadow: var(--btn-shadow);
                    line-height: 1.2;
                    text-align: center;
                    display: inline-block;
                    min-height: 44px; /* Ensure minimum touch target size */
                    min-width: 44px;
                    box-sizing: border-box;

                    /* Performance optimizations */
                    will-change: transform, box-shadow, background-color;
                    transform: translateZ(0); /* Promote to own layer for hardware acceleration */
                    transition: 
                        transform var(--btn-transition-duration) var(--btn-easing),
                        box-shadow var(--btn-transition-duration) var(--btn-easing),
                        background-color var(--btn-transition-duration) var(--btn-easing);
                }

                /* Hover state */
                ${selector} a:hover > h3 {
                    background-color: var(--btn-hover-bg);
                    box-shadow: var(--btn-hover-shadow);
                    transform: translateY(-3px) translateZ(0);
                    color: var(--btn-text); /* Ensure color persistence */
                }

                /* Focus state for keyboard accessibility */
                ${selector} a:focus-visible > h3 {
                    outline: 2px solid var(--btn-text);
                    outline-offset: 3px;
                    background-color: var(--btn-hover-bg);
                    box-shadow: var(--btn-hover-shadow);
                    transform: translateY(-3px) translateZ(0);
                }

                /* Active (click/tap) state for immediate feedback */
                ${selector} a:active > h3 {
                    transform: translateY(1px) translateZ(0);
                    box-shadow: var(--btn-active-shadow);
                    transition-duration: 0.1s; /* Make the press feel faster */
                }

                /* Accessibility: Respect user's motion preferences */
                @media (prefers-reduced-motion: reduce) {
                    ${selector} h3 {
                        transition: none;
                        transform: none !important;
                    }
                }

                /* Responsive adjustments for smaller screens */
                @media (max-width: 768px) {
                    ${selector} h3 {
                        font-size: 13px;
                        padding: 12px 20px;
                    }
                }
            `;

            const styleElement = document.createElement('style');
            styleElement.id = variantStyleId;
            styleElement.textContent = css;
            document.head.appendChild(styleElement);

        } catch (error) {
            console.error('Error in variant "Pro Category Buttons":', error);
        }
    }

    // Standard initialization logic
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initVariant);
    } else {
        initVariant();
    }
})();

// ========================================
// End of Variant 1
// ========================================

