import { readFileSync, writeFileSync } from 'node:fs';

// expo-router calls this when no navigator handles an action. On a phone the
// context value is sometimes a plain object, and the optional call throws
// "Object is not a function", which replaces the screen the user opened.
const builder = new URL(
  '../node_modules/expo-router/build/react-navigation/core/useNavigationBuilder.js',
  import.meta.url
);
const builderSource = readFileSync(builder, 'utf8');
const builderNeedle = 'onUnhandledActionParent?.(action);';
const builderGuard = `if (typeof onUnhandledActionParent === 'function') onUnhandledActionParent(action);`;

if (!builderSource.includes(builderGuard)) {
  if (!builderSource.includes(builderNeedle)) {
    console.error('guard-unhandled-nav: builder pattern missing, expo-router layout changed');
    process.exit(1);
  }
  writeFileSync(builder, builderSource.replace(builderNeedle, builderGuard));
}

// A tab does not own Settings or the listing. When it declines the action, the
// bubble through context is what should reach the stack above it. On a phone
// that bubble is dropped, so hand the action to the parent navigator directly.
const helpers = new URL(
  '../node_modules/expo-router/build/react-navigation/core/useNavigationHelpers.js',
  import.meta.url
);
const helpersSource = readFileSync(helpers, 'utf8');
const helpersNeedle = `            const handled = onAction(action);
            if (!handled) {
                onUnhandledAction?.(action);
            }`;
const helpersGuard = `            const handled = onAction(action);
            if (handled) return;
            // Context bubbling drops this on a phone. The parent stack owns
            // the sheets the tabs do not.
            if (parentNavigationHelpers?.dispatch && parentNavigationHelpers.dispatch !== dispatch) {
                parentNavigationHelpers.dispatch(action);
                return;
            }
            if (typeof onUnhandledAction === 'function') onUnhandledAction(action);`;

if (helpersSource.includes(helpersGuard)) process.exit(0);
if (!helpersSource.includes(helpersNeedle)) {
  console.error('guard-unhandled-nav: helpers pattern missing, expo-router layout changed');
  process.exit(1);
}
writeFileSync(helpers, helpersSource.replace(helpersNeedle, helpersGuard));
