import { createContext, useContext } from 'react';

// App-wide, rarely-changing state: loaded data, manifest, resolved chart tokens, theme.
export const DashContext = createContext(null);
export const useDash = () => useContext(DashContext);
