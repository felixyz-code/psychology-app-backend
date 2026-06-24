import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  AppointmentStatus,
  PrismaClient,
  UserRole,
} from '@prisma/client';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not defined.');
}

const adapter = new PrismaPg(connectionString);
const prisma = new PrismaClient({ adapter });

const DEFAULT_PASSWORD = 'ChangeMe123!';

const ADMIN_USER_ID = '1b5d4d7c-b7e6-4d8b-9b3d-a3b12f1e1001';
const PSYCHOLOGIST_USER_ID = '1b5d4d7c-b7e6-4d8b-9b3d-a3b12f1e1002';

const now = new Date();

function addDays(baseDate: Date, days: number) {
  const date = new Date(baseDate);
  date.setDate(date.getDate() + days);
  return date;
}

function setTime(date: Date, hour: number, minute: number) {
  const nextDate = new Date(date);
  nextDate.setHours(hour, minute, 0, 0);
  return nextDate;
}

function daysFromNow(days: number, hour = 10, minute = 0) {
  return setTime(addDays(now, days), hour, minute);
}

function birthDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day));
}

type DemoPatient = {
  id: string;
  caseFileId: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  email: string;
  birthDate: Date;
  diagnosis: string;
  treatmentPlan: string;
  sessionNotes: Array<{
    id: string;
    daysAgo: number;
    hour: number;
    minute: number;
    title: string;
    content: string;
  }>;
  appointments: Array<{
    id: string;
    daysFromNow: number;
    hour: number;
    minute: number;
    durationMinutes: number;
    status: AppointmentStatus;
    notes: string;
  }>;
};

const demoPatients: DemoPatient[] = [
  {
    id: '6c6afc58-fad1-4ddd-bf24-f58ce17baf01',
    caseFileId: '32af9518-79d1-4c05-8a53-6d04762ae001',
    firstName: 'Sofia',
    lastName: 'Ramirez',
    phoneNumber: '+526621110001',
    email: 'sofia.ramirez@psychology-app.local',
    birthDate: birthDate(1998, 4, 12),
    diagnosis:
      'Consulta por manejo de estres academico y dificultad para sostener rutinas de descanso. Sin datos sensibles reales.',
    treatmentPlan:
      'Plan de trabajo breve con psicoeducacion sobre estres, registro de habitos, tecnicas de respiracion y metas semanales de autocuidado.',
    sessionNotes: [
      {
        id: '5e8811a0-0b5d-4b5f-9ce4-2fcb97b01001',
        daysAgo: 45,
        hour: 10,
        minute: 0,
        title: 'Evaluacion inicial',
        content:
          'Se explora motivo de consulta, rutina diaria y principales detonantes de estres. Se acuerda llevar registro simple de sueno y actividades.',
      },
      {
        id: '5e8811a0-0b5d-4b5f-9ce4-2fcb97b01002',
        daysAgo: 15,
        hour: 10,
        minute: 0,
        title: 'Seguimiento de habitos',
        content:
          'Refiere avances en organizacion semanal. Se practica respiracion diafragmatica y se define tarea de pausas breves durante estudio.',
      },
    ],
    appointments: [
      {
        id: '9c83dd9a-9ef9-45e8-9f92-8199a6301001',
        daysFromNow: -45,
        hour: 10,
        minute: 0,
        durationMinutes: 60,
        status: AppointmentStatus.COMPLETED,
        notes: 'Primera entrevista y encuadre terapeutico.',
      },
      {
        id: '9c83dd9a-9ef9-45e8-9f92-8199a6301002',
        daysFromNow: 5,
        hour: 11,
        minute: 0,
        durationMinutes: 50,
        status: AppointmentStatus.SCHEDULED,
        notes: 'Revision de rutina de descanso y manejo de estres.',
      },
    ],
  },
  {
    id: '2fd6b374-f76b-44d6-8f1c-5f9b5ee4c902',
    caseFileId: '32af9518-79d1-4c05-8a53-6d04762ae002',
    firstName: 'Carlos',
    lastName: 'Navarro',
    phoneNumber: '+526621110002',
    email: 'carlos.navarro@psychology-app.local',
    birthDate: birthDate(1989, 9, 23),
    diagnosis:
      'Consulta por dificultades de comunicacion laboral y tension general. Se registran objetivos de habilidades de afrontamiento.',
    treatmentPlan:
      'Entrenamiento en comunicacion asertiva, identificacion de pensamientos automaticos y planeacion de conversaciones dificiles.',
    sessionNotes: [
      {
        id: '5e8811a0-0b5d-4b5f-9ce4-2fcb97b02001',
        daysAgo: 60,
        hour: 9,
        minute: 30,
        title: 'Historia del problema',
        content:
          'Se revisan situaciones laborales recientes y patrones de respuesta. Se acuerda observar momentos de mayor tension durante la semana.',
      },
      {
        id: '5e8811a0-0b5d-4b5f-9ce4-2fcb97b02002',
        daysAgo: 30,
        hour: 9,
        minute: 30,
        title: 'Comunicacion asertiva',
        content:
          'Se practica estructura de mensaje en primera persona. Reporta mayor claridad al preparar conversaciones con anticipacion.',
      },
      {
        id: '5e8811a0-0b5d-4b5f-9ce4-2fcb97b02003',
        daysAgo: 7,
        hour: 9,
        minute: 30,
        title: 'Revision de acuerdos',
        content:
          'Se refuerzan avances y se ajusta tarea para registrar resultados de conversaciones breves en contexto laboral.',
      },
    ],
    appointments: [
      {
        id: '9c83dd9a-9ef9-45e8-9f92-8199a6302001',
        daysFromNow: -60,
        hour: 9,
        minute: 30,
        durationMinutes: 60,
        status: AppointmentStatus.COMPLETED,
        notes: 'Evaluacion inicial.',
      },
      {
        id: '9c83dd9a-9ef9-45e8-9f92-8199a6302002',
        daysFromNow: -18,
        hour: 9,
        minute: 30,
        durationMinutes: 45,
        status: AppointmentStatus.NO_SHOW,
        notes: 'No se presento a la cita programada.',
      },
      {
        id: '9c83dd9a-9ef9-45e8-9f92-8199a6302003',
        daysFromNow: 12,
        hour: 12,
        minute: 0,
        durationMinutes: 60,
        status: AppointmentStatus.SCHEDULED,
        notes: 'Seguimiento de comunicacion asertiva.',
      },
    ],
  },
  {
    id: 'f1c7480d-95f7-4d97-b3bd-c4d9678bd303',
    caseFileId: '32af9518-79d1-4c05-8a53-6d04762ae003',
    firstName: 'Mariana',
    lastName: 'Lopez',
    phoneNumber: '+526621110003',
    email: 'mariana.lopez@psychology-app.local',
    birthDate: birthDate(1995, 1, 30),
    diagnosis:
      'Consulta por cambios de rutina y necesidad de fortalecer limites personales. Sin diagnosticos extremos.',
    treatmentPlan:
      'Trabajo en identificacion de necesidades, limites saludables, actividades gratificantes y seguimiento de avances quincenales.',
    sessionNotes: [
      {
        id: '5e8811a0-0b5d-4b5f-9ce4-2fcb97b03001',
        daysAgo: 30,
        hour: 16,
        minute: 0,
        title: 'Objetivos terapeuticos',
        content:
          'Se delimitan objetivos iniciales: mejorar limites, organizar tiempos personales y reducir evitacion de conversaciones importantes.',
      },
    ],
    appointments: [
      {
        id: '9c83dd9a-9ef9-45e8-9f92-8199a6303001',
        daysFromNow: -30,
        hour: 16,
        minute: 0,
        durationMinutes: 50,
        status: AppointmentStatus.COMPLETED,
        notes: 'Definicion de objetivos terapeuticos.',
      },
      {
        id: '9c83dd9a-9ef9-45e8-9f92-8199a6303002',
        daysFromNow: 2,
        hour: 16,
        minute: 30,
        durationMinutes: 50,
        status: AppointmentStatus.SCHEDULED,
        notes: 'Continuar trabajo sobre limites.',
      },
    ],
  },
  {
    id: 'b61a638b-710d-4942-af2d-2ecb16223d04',
    caseFileId: '32af9518-79d1-4c05-8a53-6d04762ae004',
    firstName: 'Diego',
    lastName: 'Torres',
    phoneNumber: '+526621110004',
    email: 'diego.torres@psychology-app.local',
    birthDate: birthDate(1992, 6, 5),
    diagnosis:
      'Consulta por adaptacion a nuevo empleo y preocupacion recurrente por desempeno. Se documentan recursos personales conservados.',
    treatmentPlan:
      'Psicoeducacion, plan de solucion de problemas, registro de logros diarios y entrenamiento en flexibilidad cognitiva.',
    sessionNotes: [
      {
        id: '5e8811a0-0b5d-4b5f-9ce4-2fcb97b04001',
        daysAgo: 45,
        hour: 13,
        minute: 0,
        title: 'Adaptacion laboral',
        content:
          'Se identifican fuentes de presion y recursos disponibles. Se acuerda registrar evidencias de desempeno suficiente.',
      },
      {
        id: '5e8811a0-0b5d-4b5f-9ce4-2fcb97b04002',
        daysAgo: 3,
        hour: 13,
        minute: 0,
        title: 'Flexibilidad cognitiva',
        content:
          'Se revisan pensamientos de exigencia elevada y se construyen alternativas mas realistas. Mantiene adherencia a tareas.',
      },
    ],
    appointments: [
      {
        id: '9c83dd9a-9ef9-45e8-9f92-8199a6304001',
        daysFromNow: -45,
        hour: 13,
        minute: 0,
        durationMinutes: 60,
        status: AppointmentStatus.COMPLETED,
        notes: 'Evaluacion de adaptacion laboral.',
      },
      {
        id: '9c83dd9a-9ef9-45e8-9f92-8199a6304002',
        daysFromNow: -3,
        hour: 13,
        minute: 0,
        durationMinutes: 60,
        status: AppointmentStatus.COMPLETED,
        notes: 'Revision de pensamientos automaticos.',
      },
      {
        id: '9c83dd9a-9ef9-45e8-9f92-8199a6304003',
        daysFromNow: 21,
        hour: 13,
        minute: 30,
        durationMinutes: 60,
        status: AppointmentStatus.SCHEDULED,
        notes: 'Seguimiento de metas laborales.',
      },
    ],
  },
  {
    id: 'd0e3be7f-9647-4df1-93eb-960f257d5b05',
    caseFileId: '32af9518-79d1-4c05-8a53-6d04762ae005',
    firstName: 'Valeria',
    lastName: 'Mendoza',
    phoneNumber: '+526621110005',
    email: 'valeria.mendoza@psychology-app.local',
    birthDate: birthDate(2001, 11, 18),
    diagnosis:
      'Consulta por organizacion personal y preocupacion por rendimiento escolar. Se establecen objetivos de manejo de tiempo.',
    treatmentPlan:
      'Crear agenda semanal, dividir tareas extensas, practicar autoinstrucciones y evaluar avance con indicadores simples.',
    sessionNotes: [
      {
        id: '5e8811a0-0b5d-4b5f-9ce4-2fcb97b05001',
        daysAgo: 60,
        hour: 17,
        minute: 0,
        title: 'Planeacion academica',
        content:
          'Se revisa calendario escolar y se priorizan tareas. Se acuerda usar bloques cortos de trabajo con descansos programados.',
      },
      {
        id: '5e8811a0-0b5d-4b5f-9ce4-2fcb97b05002',
        daysAgo: 45,
        hour: 17,
        minute: 0,
        title: 'Autoinstrucciones',
        content:
          'Se practican frases de afrontamiento para iniciar tareas. Reporta menor postergacion en actividades pequenas.',
      },
      {
        id: '5e8811a0-0b5d-4b5f-9ce4-2fcb97b05003',
        daysAgo: 15,
        hour: 17,
        minute: 0,
        title: 'Ajuste de plan',
        content:
          'Se ajusta agenda semanal para incluir horarios de descanso. Se mantiene seguimiento de avance con lista diaria.',
      },
      {
        id: '5e8811a0-0b5d-4b5f-9ce4-2fcb97b05004',
        daysAgo: 7,
        hour: 17,
        minute: 0,
        title: 'Consolidacion',
        content:
          'Se identifican estrategias utiles y situaciones que aun requieren apoyo. Se acuerda mantener bloques de estudio realistas.',
      },
    ],
    appointments: [
      {
        id: '9c83dd9a-9ef9-45e8-9f92-8199a6305001',
        daysFromNow: -60,
        hour: 17,
        minute: 0,
        durationMinutes: 50,
        status: AppointmentStatus.COMPLETED,
        notes: 'Revision de rutina academica.',
      },
      {
        id: '9c83dd9a-9ef9-45e8-9f92-8199a6305002',
        daysFromNow: -9,
        hour: 17,
        minute: 0,
        durationMinutes: 50,
        status: AppointmentStatus.CANCELLED,
        notes: 'Cancelada por cambio de horario del paciente.',
      },
      {
        id: '9c83dd9a-9ef9-45e8-9f92-8199a6305003',
        daysFromNow: 28,
        hour: 17,
        minute: 30,
        durationMinutes: 50,
        status: AppointmentStatus.SCHEDULED,
        notes: 'Seguimiento mensual de organizacion.',
      },
    ],
  },
  {
    id: 'a1cd9f79-08ab-4382-bfe2-3c044109e606',
    caseFileId: '32af9518-79d1-4c05-8a53-6d04762ae006',
    firstName: 'Luis',
    lastName: 'Herrera',
    phoneNumber: '+526621110006',
    email: 'luis.herrera@psychology-app.local',
    birthDate: birthDate(1984, 2, 2),
    diagnosis:
      'Consulta por equilibrio entre trabajo y vida personal. Se exploran habitos de descanso y actividades significativas.',
    treatmentPlan:
      'Definir limites de disponibilidad, agenda de recuperacion, comunicacion familiar y monitoreo de carga semanal.',
    sessionNotes: [
      {
        id: '5e8811a0-0b5d-4b5f-9ce4-2fcb97b06001',
        daysAgo: 30,
        hour: 8,
        minute: 30,
        title: 'Balance personal',
        content:
          'Se revisan horarios y responsabilidades. Se acuerda identificar dos espacios semanales de recuperacion personal.',
      },
      {
        id: '5e8811a0-0b5d-4b5f-9ce4-2fcb97b06002',
        daysAgo: 3,
        hour: 8,
        minute: 30,
        title: 'Limites de disponibilidad',
        content:
          'Reporta pequenas mejoras al cerrar jornada en horario definido. Se trabaja comunicacion clara de limites.',
      },
    ],
    appointments: [
      {
        id: '9c83dd9a-9ef9-45e8-9f92-8199a6306001',
        daysFromNow: -30,
        hour: 8,
        minute: 30,
        durationMinutes: 45,
        status: AppointmentStatus.COMPLETED,
        notes: 'Exploracion de balance trabajo-vida.',
      },
      {
        id: '9c83dd9a-9ef9-45e8-9f92-8199a6306002',
        daysFromNow: 7,
        hour: 8,
        minute: 30,
        durationMinutes: 45,
        status: AppointmentStatus.SCHEDULED,
        notes: 'Seguimiento de limites de disponibilidad.',
      },
    ],
  },
  {
    id: '52b3a2dc-e9da-4dcf-bbf3-bc7a980a1c07',
    caseFileId: '32af9518-79d1-4c05-8a53-6d04762ae007',
    firstName: 'Ana Paula',
    lastName: 'Castro',
    phoneNumber: '+526621110007',
    email: 'ana.castro@psychology-app.local',
    birthDate: birthDate(1990, 7, 14),
    diagnosis:
      'Consulta por ajuste a cambios familiares recientes y necesidad de fortalecer red de apoyo.',
    treatmentPlan:
      'Explorar recursos de apoyo, rutinas de autocuidado, expresion emocional y acuerdos concretos de seguimiento.',
    sessionNotes: [
      {
        id: '5e8811a0-0b5d-4b5f-9ce4-2fcb97b07001',
        daysAgo: 15,
        hour: 18,
        minute: 0,
        title: 'Red de apoyo',
        content:
          'Se identifica red cercana y formas practicas de pedir apoyo. Se acuerda una actividad de autocuidado durante la semana.',
      },
    ],
    appointments: [
      {
        id: '9c83dd9a-9ef9-45e8-9f92-8199a6307001',
        daysFromNow: -15,
        hour: 18,
        minute: 0,
        durationMinutes: 60,
        status: AppointmentStatus.COMPLETED,
        notes: 'Exploracion de red de apoyo.',
      },
      {
        id: '9c83dd9a-9ef9-45e8-9f92-8199a6307002',
        daysFromNow: 18,
        hour: 18,
        minute: 0,
        durationMinutes: 60,
        status: AppointmentStatus.SCHEDULED,
        notes: 'Seguimiento de autocuidado y apoyo familiar.',
      },
    ],
  },
  {
    id: '97d4bc2b-762b-494b-8c8d-285f1d6a2808',
    caseFileId: '32af9518-79d1-4c05-8a53-6d04762ae008',
    firstName: 'Ricardo',
    lastName: 'Salazar',
    phoneNumber: '+526621110008',
    email: 'ricardo.salazar@psychology-app.local',
    birthDate: birthDate(1978, 12, 9),
    diagnosis:
      'Consulta por manejo de preocupaciones cotidianas y mejora de descanso. Se registran objetivos preventivos.',
    treatmentPlan:
      'Higiene del sueno, registro de preocupaciones, tecnicas de relajacion y revision de habitos vespertinos.',
    sessionNotes: [
      {
        id: '5e8811a0-0b5d-4b5f-9ce4-2fcb97b08001',
        daysAgo: 60,
        hour: 12,
        minute: 30,
        title: 'Rutina de descanso',
        content:
          'Se revisan horarios de sueno y habitos nocturnos. Se acuerda reducir pantallas antes de dormir y registrar calidad de descanso.',
      },
      {
        id: '5e8811a0-0b5d-4b5f-9ce4-2fcb97b08002',
        daysAgo: 45,
        hour: 12,
        minute: 30,
        title: 'Registro de preocupaciones',
        content:
          'Se implementa tecnica de posponer preocupaciones. Reporta mejor identificacion de temas recurrentes.',
      },
      {
        id: '5e8811a0-0b5d-4b5f-9ce4-2fcb97b08003',
        daysAgo: 30,
        hour: 12,
        minute: 30,
        title: 'Relajacion',
        content:
          'Se practica relajacion breve y se acuerda aplicarla tres veces por semana antes de dormir.',
      },
      {
        id: '5e8811a0-0b5d-4b5f-9ce4-2fcb97b08004',
        daysAgo: 7,
        hour: 12,
        minute: 30,
        title: 'Seguimiento',
        content:
          'Refiere descanso mas estable. Se mantiene plan y se agregan actividades tranquilas en horario vespertino.',
      },
    ],
    appointments: [
      {
        id: '9c83dd9a-9ef9-45e8-9f92-8199a6308001',
        daysFromNow: -60,
        hour: 12,
        minute: 30,
        durationMinutes: 90,
        status: AppointmentStatus.COMPLETED,
        notes: 'Evaluacion extensa de rutina y descanso.',
      },
      {
        id: '9c83dd9a-9ef9-45e8-9f92-8199a6308002',
        daysFromNow: -22,
        hour: 12,
        minute: 30,
        durationMinutes: 60,
        status: AppointmentStatus.COMPLETED,
        notes: 'Revision de registro de preocupaciones.',
      },
      {
        id: '9c83dd9a-9ef9-45e8-9f92-8199a6308003',
        daysFromNow: 30,
        hour: 12,
        minute: 30,
        durationMinutes: 60,
        status: AppointmentStatus.SCHEDULED,
        notes: 'Seguimiento a 30 dias.',
      },
    ],
  },
  {
    id: 'd54c4bdc-0cf7-4e61-a414-d5088a92ce09',
    caseFileId: '32af9518-79d1-4c05-8a53-6d04762ae009',
    firstName: 'Fernanda',
    lastName: 'Rios',
    phoneNumber: '+526621110009',
    email: 'fernanda.rios@psychology-app.local',
    birthDate: birthDate(1997, 5, 27),
    diagnosis:
      'Consulta por toma de decisiones personales y claridad de metas. Se favorece exploracion de valores.',
    treatmentPlan:
      'Ejercicios de valores, matriz de decisiones, seguimiento de acciones pequenas y revision de obstaculos.',
    sessionNotes: [
      {
        id: '5e8811a0-0b5d-4b5f-9ce4-2fcb97b09001',
        daysAgo: 45,
        hour: 15,
        minute: 0,
        title: 'Claridad de metas',
        content:
          'Se exploran metas personales de corto plazo y valores asociados. Se acuerda priorizar dos acciones concretas.',
      },
      {
        id: '5e8811a0-0b5d-4b5f-9ce4-2fcb97b09002',
        daysAgo: 15,
        hour: 15,
        minute: 0,
        title: 'Matriz de decisiones',
        content:
          'Se revisan opciones y costos percibidos. Reporta mayor claridad para tomar una decision gradual.',
      },
    ],
    appointments: [
      {
        id: '9c83dd9a-9ef9-45e8-9f92-8199a6309001',
        daysFromNow: -45,
        hour: 15,
        minute: 0,
        durationMinutes: 60,
        status: AppointmentStatus.COMPLETED,
        notes: 'Exploracion de metas.',
      },
      {
        id: '9c83dd9a-9ef9-45e8-9f92-8199a6309002',
        daysFromNow: 10,
        hour: 15,
        minute: 0,
        durationMinutes: 50,
        status: AppointmentStatus.SCHEDULED,
        notes: 'Seguimiento de acciones concretas.',
      },
    ],
  },
  {
    id: 'c98a0b10-65cb-4b79-bbb8-1f41e8c00410',
    caseFileId: '32af9518-79d1-4c05-8a53-6d04762ae010',
    firstName: 'Jorge',
    lastName: 'Molina',
    phoneNumber: '+526621110010',
    email: 'jorge.molina@psychology-app.local',
    birthDate: birthDate(1982, 3, 21),
    diagnosis:
      'Consulta por comunicacion en pareja y manejo de desacuerdos cotidianos. Se acuerda enfoque en habilidades relacionales.',
    treatmentPlan:
      'Entrenar escucha activa, pausa ante discusiones, acuerdos semanales y registro de interacciones positivas.',
    sessionNotes: [
      {
        id: '5e8811a0-0b5d-4b5f-9ce4-2fcb97b10001',
        daysAgo: 30,
        hour: 19,
        minute: 0,
        title: 'Escucha activa',
        content:
          'Se identifica patron de interrupciones y se practica validacion breve. Se acuerda usar pausas antes de responder.',
      },
      {
        id: '5e8811a0-0b5d-4b5f-9ce4-2fcb97b10002',
        daysAgo: 7,
        hour: 19,
        minute: 0,
        title: 'Acuerdos semanales',
        content:
          'Reporta mejor disposicion para conversaciones planeadas. Se definen acuerdos especificos para una semana.',
      },
      {
        id: '5e8811a0-0b5d-4b5f-9ce4-2fcb97b10003',
        daysAgo: 3,
        hour: 19,
        minute: 0,
        title: 'Prevencion de escalamiento',
        content:
          'Se revisa uso de pausa y senales tempranas de tension. Se deja tarea de registrar interacciones positivas.',
      },
    ],
    appointments: [
      {
        id: '9c83dd9a-9ef9-45e8-9f92-8199a6310001',
        daysFromNow: -30,
        hour: 19,
        minute: 0,
        durationMinutes: 60,
        status: AppointmentStatus.COMPLETED,
        notes: 'Entrenamiento en escucha activa.',
      },
      {
        id: '9c83dd9a-9ef9-45e8-9f92-8199a6310002',
        daysFromNow: -1,
        hour: 19,
        minute: 0,
        durationMinutes: 60,
        status: AppointmentStatus.CANCELLED,
        notes: 'Cancelada con anticipacion por agenda laboral.',
      },
      {
        id: '9c83dd9a-9ef9-45e8-9f92-8199a6310003',
        daysFromNow: 24,
        hour: 19,
        minute: 0,
        durationMinutes: 60,
        status: AppointmentStatus.SCHEDULED,
        notes: 'Seguimiento de acuerdos semanales.',
      },
    ],
  },
  {
    id: 'f9fcb71f-af02-49b3-8f08-b8f6393a0511',
    caseFileId: '32af9518-79d1-4c05-8a53-6d04762ae011',
    firstName: 'Camila',
    lastName: 'Ortega',
    phoneNumber: '+526621110011',
    email: 'camila.ortega@psychology-app.local',
    birthDate: birthDate(2000, 8, 3),
    diagnosis:
      'Consulta por adaptacion universitaria y fortalecimiento de confianza social. Se plantean metas graduales.',
    treatmentPlan:
      'Exposicion gradual a actividades sociales, registro de logros, habilidades de conversacion y autocuidado.',
    sessionNotes: [
      {
        id: '5e8811a0-0b5d-4b5f-9ce4-2fcb97b11001',
        daysAgo: 15,
        hour: 11,
        minute: 30,
        title: 'Metas graduales',
        content:
          'Se definen pasos pequenos para participar en actividades universitarias. Se acuerda registrar logros sin evaluar perfeccion.',
      },
      {
        id: '5e8811a0-0b5d-4b5f-9ce4-2fcb97b11002',
        daysAgo: 3,
        hour: 11,
        minute: 30,
        title: 'Revision de exposicion',
        content:
          'Reporta haber asistido a una actividad grupal breve. Se refuerza avance y se propone siguiente paso gradual.',
      },
    ],
    appointments: [
      {
        id: '9c83dd9a-9ef9-45e8-9f92-8199a6311001',
        daysFromNow: -15,
        hour: 11,
        minute: 30,
        durationMinutes: 50,
        status: AppointmentStatus.COMPLETED,
        notes: 'Definicion de metas sociales graduales.',
      },
      {
        id: '9c83dd9a-9ef9-45e8-9f92-8199a6311002',
        daysFromNow: 14,
        hour: 11,
        minute: 30,
        durationMinutes: 50,
        status: AppointmentStatus.SCHEDULED,
        notes: 'Seguimiento de exposicion gradual.',
      },
    ],
  },
  {
    id: 'e5719f83-c6d5-4c87-b5c2-87ef097efa12',
    caseFileId: '32af9518-79d1-4c05-8a53-6d04762ae012',
    firstName: 'Andres',
    lastName: 'Vega',
    phoneNumber: '+526621110012',
    email: 'andres.vega@psychology-app.local',
    birthDate: birthDate(1987, 10, 16),
    diagnosis:
      'Consulta por seguimiento de metas personales y manejo de frustracion ante cambios de planes.',
    treatmentPlan:
      'Trabajo en tolerancia a la frustracion, planeacion flexible, registro de avances y reestructuracion de expectativas.',
    sessionNotes: [
      {
        id: '5e8811a0-0b5d-4b5f-9ce4-2fcb97b12001',
        daysAgo: 60,
        hour: 14,
        minute: 0,
        title: 'Expectativas y metas',
        content:
          'Se identifican expectativas rigidas y efectos en el estado de animo cotidiano. Se acuerdan metas ajustables.',
      },
      {
        id: '5e8811a0-0b5d-4b5f-9ce4-2fcb97b12002',
        daysAgo: 45,
        hour: 14,
        minute: 0,
        title: 'Planeacion flexible',
        content:
          'Se practica generar alternativas ante cambios de agenda. Reporta mayor facilidad para retomar actividades.',
      },
      {
        id: '5e8811a0-0b5d-4b5f-9ce4-2fcb97b12003',
        daysAgo: 30,
        hour: 14,
        minute: 0,
        title: 'Registro de avances',
        content:
          'Se revisan avances pequenos y se normalizan ajustes. Se mantiene tarea de registrar logros semanales.',
      },
      {
        id: '5e8811a0-0b5d-4b5f-9ce4-2fcb97b12004',
        daysAgo: 15,
        hour: 14,
        minute: 0,
        title: 'Seguimiento de frustracion',
        content:
          'Se analizan respuestas ante imprevistos recientes. Se acuerdan pausas breves antes de decidir cambios de plan.',
      },
    ],
    appointments: [
      {
        id: '9c83dd9a-9ef9-45e8-9f92-8199a6312001',
        daysFromNow: -60,
        hour: 14,
        minute: 0,
        durationMinutes: 90,
        status: AppointmentStatus.COMPLETED,
        notes: 'Evaluacion inicial amplia.',
      },
      {
        id: '9c83dd9a-9ef9-45e8-9f92-8199a6312002',
        daysFromNow: -6,
        hour: 14,
        minute: 0,
        durationMinutes: 60,
        status: AppointmentStatus.NO_SHOW,
        notes: 'No asistio a seguimiento programado.',
      },
      {
        id: '9c83dd9a-9ef9-45e8-9f92-8199a6312003',
        daysFromNow: 4,
        hour: 14,
        minute: 0,
        durationMinutes: 60,
        status: AppointmentStatus.SCHEDULED,
        notes: 'Reprogramacion de seguimiento.',
      },
    ],
  },
  {
    id: '2e57dc81-6cd0-4b01-ab06-a1d799de7113',
    caseFileId: '32af9518-79d1-4c05-8a53-6d04762ae013',
    firstName: 'Natalia',
    lastName: 'Paredes',
    phoneNumber: '+526621110013',
    email: 'natalia.paredes@psychology-app.local',
    birthDate: birthDate(1993, 4, 6),
    diagnosis:
      'Consulta por autocuidado y recuperacion de actividades significativas tras periodo de alta demanda.',
    treatmentPlan:
      'Agenda de autocuidado, identificacion de energia disponible, limites en compromisos y seguimiento de actividades valiosas.',
    sessionNotes: [
      {
        id: '5e8811a0-0b5d-4b5f-9ce4-2fcb97b13001',
        daysAgo: 30,
        hour: 10,
        minute: 30,
        title: 'Actividades significativas',
        content:
          'Se identifican actividades que aportan bienestar y barreras para retomarlas. Se acuerda iniciar con una actividad breve.',
      },
      {
        id: '5e8811a0-0b5d-4b5f-9ce4-2fcb97b13002',
        daysAgo: 7,
        hour: 10,
        minute: 30,
        title: 'Energia disponible',
        content:
          'Se revisa carga semanal y se ajustan compromisos. Reporta mejor reconocimiento de limites personales.',
      },
    ],
    appointments: [
      {
        id: '9c83dd9a-9ef9-45e8-9f92-8199a6313001',
        daysFromNow: -30,
        hour: 10,
        minute: 30,
        durationMinutes: 50,
        status: AppointmentStatus.COMPLETED,
        notes: 'Exploracion de autocuidado.',
      },
      {
        id: '9c83dd9a-9ef9-45e8-9f92-8199a6313002',
        daysFromNow: 16,
        hour: 10,
        minute: 30,
        durationMinutes: 50,
        status: AppointmentStatus.SCHEDULED,
        notes: 'Seguimiento de actividades significativas.',
      },
    ],
  },
  {
    id: '4aa73e34-e715-4a3d-8823-cf2d2a00e814',
    caseFileId: '32af9518-79d1-4c05-8a53-6d04762ae014',
    firstName: 'Mateo',
    lastName: 'Cardenas',
    phoneNumber: '+526621110014',
    email: 'mateo.cardenas@psychology-app.local',
    birthDate: birthDate(1999, 9, 11),
    diagnosis:
      'Consulta por manejo de impulsividad en conversaciones y mejora de toma de perspectiva.',
    treatmentPlan:
      'Practicar pausa-respuesta, identificacion de emociones, toma de perspectiva y acuerdos de comunicacion.',
    sessionNotes: [
      {
        id: '5e8811a0-0b5d-4b5f-9ce4-2fcb97b14001',
        daysAgo: 45,
        hour: 16,
        minute: 30,
        title: 'Pausa-respuesta',
        content:
          'Se introduce tecnica de pausa antes de responder. Se acuerda practicarla en conversaciones de baja intensidad.',
      },
      {
        id: '5e8811a0-0b5d-4b5f-9ce4-2fcb97b14002',
        daysAgo: 15,
        hour: 16,
        minute: 30,
        title: 'Toma de perspectiva',
        content:
          'Se trabajan ejemplos recientes y alternativas de respuesta. Reporta menor escalamiento en una situacion cotidiana.',
      },
      {
        id: '5e8811a0-0b5d-4b5f-9ce4-2fcb97b14003',
        daysAgo: 3,
        hour: 16,
        minute: 30,
        title: 'Seguimiento de practica',
        content:
          'Se revisan intentos de pausa-respuesta y se refuerza progreso gradual. Se deja tarea de registrar detonantes.',
      },
    ],
    appointments: [
      {
        id: '9c83dd9a-9ef9-45e8-9f92-8199a6314001',
        daysFromNow: -45,
        hour: 16,
        minute: 30,
        durationMinutes: 60,
        status: AppointmentStatus.COMPLETED,
        notes: 'Tecnica pausa-respuesta.',
      },
      {
        id: '9c83dd9a-9ef9-45e8-9f92-8199a6314002',
        daysFromNow: 9,
        hour: 16,
        minute: 30,
        durationMinutes: 60,
        status: AppointmentStatus.SCHEDULED,
        notes: 'Seguimiento de toma de perspectiva.',
      },
    ],
  },
  {
    id: '5a7143d1-8554-4d85-8aca-0c9df22a1815',
    caseFileId: '32af9518-79d1-4c05-8a53-6d04762ae015',
    firstName: 'Elena',
    lastName: 'Soto',
    phoneNumber: '+526621110015',
    email: 'elena.soto@psychology-app.local',
    birthDate: birthDate(1975, 1, 25),
    diagnosis:
      'Consulta por transicion de etapa personal y redefinicion de rutinas. Se orienta a metas de bienestar cotidiano.',
    treatmentPlan:
      'Explorar prioridades actuales, crear rutina flexible, fortalecer actividades de apoyo y revisar avances mensuales.',
    sessionNotes: [
      {
        id: '5e8811a0-0b5d-4b5f-9ce4-2fcb97b15001',
        daysAgo: 60,
        hour: 9,
        minute: 0,
        title: 'Transicion de etapa',
        content:
          'Se exploran cambios recientes y prioridades actuales. Se acuerda observar actividades que generan bienestar.',
      },
      {
        id: '5e8811a0-0b5d-4b5f-9ce4-2fcb97b15002',
        daysAgo: 30,
        hour: 9,
        minute: 0,
        title: 'Rutina flexible',
        content:
          'Se disena rutina semanal con espacios de actividad fisica ligera y contacto social. Se acuerda seguimiento gradual.',
      },
      {
        id: '5e8811a0-0b5d-4b5f-9ce4-2fcb97b15003',
        daysAgo: 7,
        hour: 9,
        minute: 0,
        title: 'Revision mensual',
        content:
          'Reporta mayor estructura durante la semana. Se ajustan metas para mantener consistencia sin rigidez.',
      },
    ],
    appointments: [
      {
        id: '9c83dd9a-9ef9-45e8-9f92-8199a6315001',
        daysFromNow: -60,
        hour: 9,
        minute: 0,
        durationMinutes: 90,
        status: AppointmentStatus.COMPLETED,
        notes: 'Evaluacion inicial de transicion vital.',
      },
      {
        id: '9c83dd9a-9ef9-45e8-9f92-8199a6315002',
        daysFromNow: 26,
        hour: 9,
        minute: 0,
        durationMinutes: 60,
        status: AppointmentStatus.SCHEDULED,
        notes: 'Revision mensual de rutina flexible.',
      },
    ],
  },
];

const DEMO_PATIENT_IDS = demoPatients.map((patient) => patient.id);

async function upsertUser(params: {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
}) {
  return prisma.user.upsert({
    where: { email: params.email },
    update: {
      id: params.id,
      name: params.name,
      passwordHash: params.passwordHash,
      role: params.role,
    },
    create: {
      id: params.id,
      name: params.name,
      email: params.email,
      passwordHash: params.passwordHash,
      role: params.role,
    },
    select: {
      id: true,
      email: true,
    },
  });
}

async function resetDemoClinicalData() {
  const demoCaseFiles = await prisma.caseFile.findMany({
    where: { patientId: { in: DEMO_PATIENT_IDS } },
    select: { id: true },
  });

  const demoCaseFileIds = demoCaseFiles.map((caseFile) => caseFile.id);

  await prisma.$transaction([
    prisma.appointment.deleteMany({
      where: { patientId: { in: DEMO_PATIENT_IDS } },
    }),
    ...(demoCaseFileIds.length > 0
      ? [
          prisma.sessionNote.deleteMany({
            where: { caseFileId: { in: demoCaseFileIds } },
          }),
          prisma.document.deleteMany({
            where: { caseFileId: { in: demoCaseFileIds } },
          }),
        ]
      : []),
    prisma.caseFile.deleteMany({
      where: { patientId: { in: DEMO_PATIENT_IDS } },
    }),
    prisma.patient.deleteMany({
      where: { id: { in: DEMO_PATIENT_IDS } },
    }),
  ]);
}

async function seedDemoClinicalData(psychologistId: string) {
  const patients = demoPatients.map((patient) => ({
    id: patient.id,
    psychologistId,
    firstName: patient.firstName,
    lastName: patient.lastName,
    phoneNumber: patient.phoneNumber,
    email: patient.email,
    birthDate: patient.birthDate,
  }));

  const caseFiles = demoPatients.map((patient) => ({
    id: patient.caseFileId,
    patientId: patient.id,
    diagnosis: patient.diagnosis,
    treatmentPlan: patient.treatmentPlan,
  }));

  const sessionNotes = demoPatients.flatMap((patient) =>
    patient.sessionNotes.map((note) => ({
      id: note.id,
      caseFileId: patient.caseFileId,
      authorId: psychologistId,
      sessionDate: daysFromNow(-note.daysAgo, note.hour, note.minute),
      title: note.title,
      content: note.content,
    })),
  );

  const appointments = demoPatients.flatMap((patient) =>
    patient.appointments.map((appointment) => ({
      id: appointment.id,
      patientId: patient.id,
      psychologistId,
      scheduledAt: daysFromNow(
        appointment.daysFromNow,
        appointment.hour,
        appointment.minute,
      ),
      durationMinutes: appointment.durationMinutes,
      status: appointment.status,
      notes: appointment.notes,
    })),
  );

  await prisma.$transaction([
    prisma.patient.createMany({ data: patients }),
    prisma.caseFile.createMany({ data: caseFiles }),
    prisma.sessionNote.createMany({ data: sessionNotes }),
    prisma.appointment.createMany({ data: appointments }),
  ]);

  const appointmentDates = appointments.map((appointment) => appointment.scheduledAt);
  const futureAppointments = appointments.filter(
    (appointment) => appointment.scheduledAt > now,
  );

  return {
    patients: patients.length,
    caseFiles: caseFiles.length,
    sessionNotes: sessionNotes.length,
    appointments: appointments.length,
    futureAppointments: futureAppointments.length,
    firstAppointmentDate: new Date(
      Math.min(...appointmentDates.map((date) => date.getTime())),
    ),
    lastAppointmentDate: new Date(
      Math.max(...appointmentDates.map((date) => date.getTime())),
    ),
  };
}

async function main() {
  const defaultPasswordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  const admin = await upsertUser({
    id: ADMIN_USER_ID,
    name: 'Enrique Felix',
    email: 'admin@psychology-app.local',
    passwordHash: defaultPasswordHash,
    role: UserRole.ADMIN,
  });

  const psychologist = await upsertUser({
    id: PSYCHOLOGIST_USER_ID,
    name: 'Demo Psychologist',
    email: 'psychologist@psychology-app.local',
    passwordHash: defaultPasswordHash,
    role: UserRole.PSYCHOLOGIST,
  });

  await resetDemoClinicalData();
  const seedSummary = await seedDemoClinicalData(psychologist.id);

  console.log('Seed completed successfully.');
  console.log(`Demo password: ${DEFAULT_PASSWORD}`);
  console.log(`Admin user: ${admin.email}`);
  console.log(`Psychologist user: ${psychologist.email}`);
  console.log(`Patients seeded: ${seedSummary.patients}`);
  console.log(`Case files seeded: ${seedSummary.caseFiles}`);
  console.log(`Session notes seeded: ${seedSummary.sessionNotes}`);
  console.log(`Appointments seeded: ${seedSummary.appointments}`);
  console.log(`Future appointments seeded: ${seedSummary.futureAppointments}`);
  console.log(`Date reference used: ${now.toISOString()}`);
  console.log(
    `Appointment date range: ${seedSummary.firstAppointmentDate.toISOString()} - ${seedSummary.lastAppointmentDate.toISOString()}`,
  );
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
