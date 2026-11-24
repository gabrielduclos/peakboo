import {demoStrings} from './strings';
import { strings as base } from "../i18n";
export const strings: typeof base = {
  pt: {
    ...base.pt,...demoStrings.pt,
    demo: "Demonstração de portfólio",
    demoShort: "Portfólio",
    demoDesc:
      "Explore o PeakBoo. Dados fictícios; alterações salvas somente neste navegador.",
    createAccount: "Sobre a demonstração",
    emptyInvite: "Os convites desta demonstração são fictícios.",
    demoOnly: "Esta apresentação usa somente dados fictícios.",
  },
  en: {
    ...base.en,...demoStrings.en,
    demo: "Portfolio demo",
    demoShort: "Portfolio",
    demoDesc:
      "Explore PeakBoo. Sample data; changes are saved only in this browser.",
    createAccount: "About this demo",
    emptyInvite: "Invitations in this demo are fictional.",
    demoOnly: "This presentation uses sample data only.",
  },
};
