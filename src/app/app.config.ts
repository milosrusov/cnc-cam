import { ApplicationConfig, APP_INITIALIZER, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideStore } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';
import { provideAnimations } from '@angular/platform-browser/animations';

import { routes } from './app.routes';
import { cadReducer } from './state/cad/cad.reducer';
import { camReducer } from './state/cam/cam.reducer';
import { uiReducer } from './state/ui/ui.reducer';
import { MockProjectService } from './core/services/mock-project.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideAnimations(),
    provideStore({
      cad: cadReducer,
      cam: camReducer,
      ui: uiReducer,
    }),
    provideEffects([]),
    {
      provide: APP_INITIALIZER,
      useFactory: (mock: MockProjectService) => () => mock.load(),
      deps: [MockProjectService],
      multi: true,
    },
  ],
};
