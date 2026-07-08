export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      active_rooms: {
        Row: {
          created_at: string
          host_id: string | null
          participants: string[]
          room: string
          title: string | null
        }
        Insert: {
          created_at?: string
          host_id?: string | null
          participants?: string[]
          room: string
          title?: string | null
        }
        Update: {
          created_at?: string
          host_id?: string | null
          participants?: string[]
          room?: string
          title?: string | null
        }
        Relationships: []
      }
      activity_log: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: unknown
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: unknown
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: unknown
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      advanced_projects: {
        Row: {
          budget: number | null
          created_at: string | null
          description: string | null
          end_date: string | null
          id: string
          milestones: Json | null
          project_name: string
          resources: Json | null
          risks: Json | null
          spent: number | null
          start_date: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          budget?: number | null
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          milestones?: Json | null
          project_name: string
          resources?: Json | null
          risks?: Json | null
          spent?: number | null
          start_date?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          budget?: number | null
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          milestones?: Json | null
          project_name?: string
          resources?: Json | null
          risks?: Json | null
          spent?: number | null
          start_date?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      attachments: {
        Row: {
          created_at: string | null
          entity_id: string
          entity_type: string
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          file_url: string | null
          id: string
          mime_type: string | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string | null
          entity_id: string
          entity_type: string
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          mime_type?: string | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string | null
          entity_id?: string
          entity_type?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          mime_type?: string | null
          uploaded_by?: string | null
        }
        Relationships: []
      }
      auditoria: {
        Row: {
          datos_anteriores: Json | null
          datos_nuevos: Json | null
          fecha_hora: string | null
          id: number
          ip_address: unknown
          operacion: string
          registro_id: number
          tabla: string
          user_agent: string | null
          usuario_id: string | null
        }
        Insert: {
          datos_anteriores?: Json | null
          datos_nuevos?: Json | null
          fecha_hora?: string | null
          id?: number
          ip_address?: unknown
          operacion: string
          registro_id: number
          tabla: string
          user_agent?: string | null
          usuario_id?: string | null
        }
        Update: {
          datos_anteriores?: Json | null
          datos_nuevos?: Json | null
          fecha_hora?: string | null
          id?: number
          ip_address?: unknown
          operacion?: string
          registro_id?: number
          tabla?: string
          user_agent?: string | null
          usuario_id?: string | null
        }
        Relationships: []
      }
      bitacora_auditoria: {
        Row: {
          descripcion_evento: string | null
          direccion_ip: string | null
          fecha_hora_evento: string | null
          log_id: number
          tipo_evento: string | null
          usuario_responsable: string | null
        }
        Insert: {
          descripcion_evento?: string | null
          direccion_ip?: string | null
          fecha_hora_evento?: string | null
          log_id?: number
          tipo_evento?: string | null
          usuario_responsable?: string | null
        }
        Update: {
          descripcion_evento?: string | null
          direccion_ip?: string | null
          fecha_hora_evento?: string | null
          log_id?: number
          tipo_evento?: string | null
          usuario_responsable?: string | null
        }
        Relationships: []
      }
      bloques_horario: {
        Row: {
          descripcion: string | null
          hora_entrada: string
          hora_salida: string
          horario_id: number
          id: number
          orden_bloque: number
          tolerancia_entrada_min: number | null
          tolerancia_salida_min: number | null
        }
        Insert: {
          descripcion?: string | null
          hora_entrada: string
          hora_salida: string
          horario_id: number
          id?: number
          orden_bloque: number
          tolerancia_entrada_min?: number | null
          tolerancia_salida_min?: number | null
        }
        Update: {
          descripcion?: string | null
          hora_entrada?: string
          hora_salida?: string
          horario_id?: number
          id?: number
          orden_bloque?: number
          tolerancia_entrada_min?: number | null
          tolerancia_salida_min?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bloques_horario_horario_id_fkey"
            columns: ["horario_id"]
            isOneToOne: false
            referencedRelation: "horarios"
            referencedColumns: ["id"]
          },
        ]
      }
      catalogo_proveedores: {
        Row: {
          codigo_interno: string | null
          esta_activo: boolean | null
          fecha_registro: string | null
          proveedor_id: number
          razon_social: string
        }
        Insert: {
          codigo_interno?: string | null
          esta_activo?: boolean | null
          fecha_registro?: string | null
          proveedor_id?: number
          razon_social: string
        }
        Update: {
          codigo_interno?: string | null
          esta_activo?: boolean | null
          fecha_registro?: string | null
          proveedor_id?: number
          razon_social?: string
        }
        Relationships: []
      }
      comments: {
        Row: {
          author_id: string | null
          content: string
          created_at: string | null
          id: string
          parent_id: string
          parent_type: string
          updated_at: string | null
        }
        Insert: {
          author_id?: string | null
          content: string
          created_at?: string | null
          id?: string
          parent_id: string
          parent_type: string
          updated_at?: string | null
        }
        Update: {
          author_id?: string | null
          content?: string
          created_at?: string | null
          id?: string
          parent_id?: string
          parent_type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      configuracion_qr: {
        Row: {
          activo: boolean
          empleado_id: number
          fecha_generacion: string | null
          id: number
          qr_entrada: string
          qr_salida: string
        }
        Insert: {
          activo?: boolean
          empleado_id: number
          fecha_generacion?: string | null
          id?: number
          qr_entrada: string
          qr_salida: string
        }
        Update: {
          activo?: boolean
          empleado_id?: number
          fecha_generacion?: string | null
          id?: number
          qr_entrada?: string
          qr_salida?: string
        }
        Relationships: [
          {
            foreignKeyName: "configuracion_qr_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "empleados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "configuracion_qr_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "v_asistencia_hoy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "configuracion_qr_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "v_empleados_completos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "configuracion_qr_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "vista_usuarios_completa"
            referencedColumns: ["empleado_id"]
          },
        ]
      }
      distribucion_entregas: {
        Row: {
          abonos: number | null
          actual_arrival_time: string | null
          anio: number | null
          cod_cte: string | null
          cod_estab: number | null
          costo: number | null
          costo_aynt: number | null
          costo_chof: number | null
          costo_gas: number | null
          costo_mant: number | null
          costo_total: number | null
          created_at: string | null
          embarque: string | null
          fecha: string | null
          fecha_pago: string | null
          fecha_pedido_cliente: string | null
          horas_laborables: number | null
          id: number
          importe: number | null
          iva: number | null
          km: number | null
          latitude: number | null
          longitude: number | null
          peso: number | null
          prorrateo_total: number | null
          route_id: string | null
          semana: string | null
          stop_name: string | null
          stop_notes: string | null
          tipo: string | null
          total_final: number | null
          total_minutes: number | null
          total_pedido: number | null
          unidades: number | null
          utilidad_bruta: number | null
          vehicle: string | null
          vendedor: string | null
        }
        Insert: {
          abonos?: number | null
          actual_arrival_time?: string | null
          anio?: number | null
          cod_cte?: string | null
          cod_estab?: number | null
          costo?: number | null
          costo_aynt?: number | null
          costo_chof?: number | null
          costo_gas?: number | null
          costo_mant?: number | null
          costo_total?: number | null
          created_at?: string | null
          embarque?: string | null
          fecha?: string | null
          fecha_pago?: string | null
          fecha_pedido_cliente?: string | null
          horas_laborables?: number | null
          id?: number
          importe?: number | null
          iva?: number | null
          km?: number | null
          latitude?: number | null
          longitude?: number | null
          peso?: number | null
          prorrateo_total?: number | null
          route_id?: string | null
          semana?: string | null
          stop_name?: string | null
          stop_notes?: string | null
          tipo?: string | null
          total_final?: number | null
          total_minutes?: number | null
          total_pedido?: number | null
          unidades?: number | null
          utilidad_bruta?: number | null
          vehicle?: string | null
          vendedor?: string | null
        }
        Update: {
          abonos?: number | null
          actual_arrival_time?: string | null
          anio?: number | null
          cod_cte?: string | null
          cod_estab?: number | null
          costo?: number | null
          costo_aynt?: number | null
          costo_chof?: number | null
          costo_gas?: number | null
          costo_mant?: number | null
          costo_total?: number | null
          created_at?: string | null
          embarque?: string | null
          fecha?: string | null
          fecha_pago?: string | null
          fecha_pedido_cliente?: string | null
          horas_laborables?: number | null
          id?: number
          importe?: number | null
          iva?: number | null
          km?: number | null
          latitude?: number | null
          longitude?: number | null
          peso?: number | null
          prorrateo_total?: number | null
          route_id?: string | null
          semana?: string | null
          stop_name?: string | null
          stop_notes?: string | null
          tipo?: string | null
          total_final?: number | null
          total_minutes?: number | null
          total_pedido?: number | null
          unidades?: number | null
          utilidad_bruta?: number | null
          vehicle?: string | null
          vendedor?: string | null
        }
        Relationships: []
      }
      documentos_adjuntos: {
        Row: {
          documento_id: number
          factura_relacionada_id: number
          fecha_subida: string | null
          id_google_drive: string
          nombre_archivo_actual: string
          nombre_archivo_original: string | null
          tipo_mime: string | null
          tipo_proceso: string
          url_acceso_directo: string
          usuario_que_subio: string | null
        }
        Insert: {
          documento_id?: number
          factura_relacionada_id: number
          fecha_subida?: string | null
          id_google_drive: string
          nombre_archivo_actual: string
          nombre_archivo_original?: string | null
          tipo_mime?: string | null
          tipo_proceso: string
          url_acceso_directo: string
          usuario_que_subio?: string | null
        }
        Update: {
          documento_id?: number
          factura_relacionada_id?: number
          fecha_subida?: string | null
          id_google_drive?: string
          nombre_archivo_actual?: string
          nombre_archivo_original?: string | null
          tipo_mime?: string | null
          tipo_proceso?: string
          url_acceso_directo?: string
          usuario_que_subio?: string | null
        }
        Relationships: []
      }
      empleado_dispositivos: {
        Row: {
          activo: boolean | null
          desvinculado_en: string | null
          desvinculado_por: string | null
          device_id: string
          empleado_id: number
          fecha_vinculacion: string | null
          id: string
          pin_hash: string
          pin_salt: string
          ultimo_uso: string | null
          user_agent: string | null
        }
        Insert: {
          activo?: boolean | null
          desvinculado_en?: string | null
          desvinculado_por?: string | null
          device_id: string
          empleado_id: number
          fecha_vinculacion?: string | null
          id?: string
          pin_hash: string
          pin_salt: string
          ultimo_uso?: string | null
          user_agent?: string | null
        }
        Update: {
          activo?: boolean | null
          desvinculado_en?: string | null
          desvinculado_por?: string | null
          device_id?: string
          empleado_id?: number
          fecha_vinculacion?: string | null
          id?: string
          pin_hash?: string
          pin_salt?: string
          ultimo_uso?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "empleado_dispositivos_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "empleados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "empleado_dispositivos_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "v_asistencia_hoy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "empleado_dispositivos_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "v_empleados_completos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "empleado_dispositivos_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "vista_usuarios_completa"
            referencedColumns: ["empleado_id"]
          },
        ]
      }
      empleados: {
        Row: {
          activo: boolean
          apellido: string
          codigo_empleado: string
          fecha_alta: string | null
          foto_perfil: string | null
          horario_id: number | null
          id: number
          nombre: string
          puesto: string | null
          sucursal: string | null
          telefono_whatsapp: string | null
          trabaja_domingo: boolean | null
        }
        Insert: {
          activo?: boolean
          apellido: string
          codigo_empleado: string
          fecha_alta?: string | null
          foto_perfil?: string | null
          horario_id?: number | null
          id?: number
          nombre: string
          puesto?: string | null
          sucursal?: string | null
          telefono_whatsapp?: string | null
          trabaja_domingo?: boolean | null
        }
        Update: {
          activo?: boolean
          apellido?: string
          codigo_empleado?: string
          fecha_alta?: string | null
          foto_perfil?: string | null
          horario_id?: number | null
          id?: number
          nombre?: string
          puesto?: string | null
          sucursal?: string | null
          telefono_whatsapp?: string | null
          trabaja_domingo?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "empleados_horario_id_fkey"
            columns: ["horario_id"]
            isOneToOne: false
            referencedRelation: "horarios"
            referencedColumns: ["id"]
          },
        ]
      }
      historial_cambios: {
        Row: {
          descripcion_detallada: string | null
          estado_anterior: string | null
          estado_nuevo: string | null
          factura_relacionada_id: number
          fecha_hora_accion: string | null
          registro_id: number
          tipo_accion: string | null
          tipo_proceso: string
          usuario_responsable: string
        }
        Insert: {
          descripcion_detallada?: string | null
          estado_anterior?: string | null
          estado_nuevo?: string | null
          factura_relacionada_id: number
          fecha_hora_accion?: string | null
          registro_id?: number
          tipo_accion?: string | null
          tipo_proceso: string
          usuario_responsable: string
        }
        Update: {
          descripcion_detallada?: string | null
          estado_anterior?: string | null
          estado_nuevo?: string | null
          factura_relacionada_id?: number
          fecha_hora_accion?: string | null
          registro_id?: number
          tipo_accion?: string | null
          tipo_proceso?: string
          usuario_responsable?: string
        }
        Relationships: []
      }
      horarios: {
        Row: {
          activo: boolean
          descripcion: string | null
          fecha_creacion: string | null
          id: number
          nombre: string
        }
        Insert: {
          activo?: boolean
          descripcion?: string | null
          fecha_creacion?: string | null
          id?: number
          nombre: string
        }
        Update: {
          activo?: boolean
          descripcion?: string | null
          fecha_creacion?: string | null
          id?: number
          nombre?: string
        }
        Relationships: []
      }
      justificaciones: {
        Row: {
          created_at: string | null
          created_by: string | null
          documento_nombre: string | null
          documento_url: string | null
          eliminado_en: string | null
          eliminado_motivo: string | null
          eliminado_por: string | null
          empleado_id: number
          fecha_fin: string
          fecha_inicio: string
          id: number
          motivo: string | null
          tipo: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          documento_nombre?: string | null
          documento_url?: string | null
          eliminado_en?: string | null
          eliminado_motivo?: string | null
          eliminado_por?: string | null
          empleado_id: number
          fecha_fin: string
          fecha_inicio: string
          id?: number
          motivo?: string | null
          tipo: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          documento_nombre?: string | null
          documento_url?: string | null
          eliminado_en?: string | null
          eliminado_motivo?: string | null
          eliminado_por?: string | null
          empleado_id?: number
          fecha_fin?: string
          fecha_inicio?: string
          id?: number
          motivo?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "justificaciones_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "empleados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "justificaciones_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "v_asistencia_hoy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "justificaciones_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "v_empleados_completos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "justificaciones_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "vista_usuarios_completa"
            referencedColumns: ["empleado_id"]
          },
        ]
      }
      meeting_live: {
        Row: {
          agenda: Json
          current_index: number
          host_id: string
          id: string
          meeting_kind: string
          participants: string[]
          project_id: string | null
          room: string
          started_at: string
          status: string
          template_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          agenda?: Json
          current_index?: number
          host_id: string
          id?: string
          meeting_kind?: string
          participants?: string[]
          project_id?: string | null
          room: string
          started_at?: string
          status?: string
          template_id?: string | null
          title?: string
          updated_at?: string
        }
        Update: {
          agenda?: Json
          current_index?: number
          host_id?: string
          id?: string
          meeting_kind?: string
          participants?: string[]
          project_id?: string | null
          room?: string
          started_at?: string
          status?: string
          template_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_live_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_participants: {
        Row: {
          id: string
          is_host: boolean
          joined_at: string
          muted: boolean
          name: string | null
          room: string
          state: string
          user_id: string
        }
        Insert: {
          id?: string
          is_host?: boolean
          joined_at?: string
          muted?: boolean
          name?: string | null
          room: string
          state?: string
          user_id: string
        }
        Update: {
          id?: string
          is_host?: boolean
          joined_at?: string
          muted?: boolean
          name?: string | null
          room?: string
          state?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_participants_room_fkey"
            columns: ["room"]
            isOneToOne: false
            referencedRelation: "meeting_live"
            referencedColumns: ["room"]
          },
        ]
      }
      meetings: {
        Row: {
          agreements: Json | null
          attendees: string[] | null
          audio_url: string | null
          checkin_data: Json | null
          created_at: string | null
          created_by: string | null
          duration_minutes: number | null
          egress_id: string | null
          id: string
          issues: Json | null
          jitsi_room: string | null
          meeting_date: string
          meeting_kind: string
          metadata: Json | null
          project_id: string | null
          rating: number | null
          rocks: Json | null
          scorecard: Json | null
          section_log: Json | null
          summary: string | null
          template_id: string | null
          title: string
          transcript: string | null
          updated_at: string | null
          video_url: string | null
        }
        Insert: {
          agreements?: Json | null
          attendees?: string[] | null
          audio_url?: string | null
          checkin_data?: Json | null
          created_at?: string | null
          created_by?: string | null
          duration_minutes?: number | null
          egress_id?: string | null
          id?: string
          issues?: Json | null
          jitsi_room?: string | null
          meeting_date: string
          meeting_kind?: string
          metadata?: Json | null
          project_id?: string | null
          rating?: number | null
          rocks?: Json | null
          scorecard?: Json | null
          section_log?: Json | null
          summary?: string | null
          template_id?: string | null
          title: string
          transcript?: string | null
          updated_at?: string | null
          video_url?: string | null
        }
        Update: {
          agreements?: Json | null
          attendees?: string[] | null
          audio_url?: string | null
          checkin_data?: Json | null
          created_at?: string | null
          created_by?: string | null
          duration_minutes?: number | null
          egress_id?: string | null
          id?: string
          issues?: Json | null
          jitsi_room?: string | null
          meeting_date?: string
          meeting_kind?: string
          metadata?: Json | null
          project_id?: string | null
          rating?: number | null
          rocks?: Json | null
          scorecard?: Json | null
          section_log?: Json | null
          summary?: string | null
          template_id?: string | null
          title?: string
          transcript?: string | null
          updated_at?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meetings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "weekly_meeting_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string | null
          id: string
          message: string | null
          read: boolean | null
          read_at: string | null
          related_id: string | null
          related_type: string | null
          title: string
          type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          message?: string | null
          read?: boolean | null
          read_at?: string | null
          related_id?: string | null
          related_type?: string | null
          title: string
          type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          message?: string | null
          read?: boolean | null
          read_at?: string | null
          related_id?: string | null
          related_type?: string | null
          title?: string
          type?: string
          user_id?: string | null
        }
        Relationships: []
      }
      pbs_facturas_recibidas: {
        Row: {
          codigo_proveedor: string | null
          concepto_detalle: string | null
          estado_actual: string
          factura_id: number
          fecha_creacion_registro: string | null
          fecha_emision: string
          fecha_ultima_actualizacion: string | null
          mes_periodo: string | null
          monto_total: number
          nombre_proveedor: string
          numero_factura: string
          origen_importacion: string | null
          poliza_contable: string | null
          poliza_contable2: string | null
          porcentaje_progreso: number | null
          ruta_archivo_red: string | null
          sucursal_origen: string | null
          tiene_pdf_adjunto: boolean | null
          usuario_creador: string | null
        }
        Insert: {
          codigo_proveedor?: string | null
          concepto_detalle?: string | null
          estado_actual?: string
          factura_id?: number
          fecha_creacion_registro?: string | null
          fecha_emision: string
          fecha_ultima_actualizacion?: string | null
          mes_periodo?: string | null
          monto_total: number
          nombre_proveedor: string
          numero_factura: string
          origen_importacion?: string | null
          poliza_contable?: string | null
          poliza_contable2?: string | null
          porcentaje_progreso?: number | null
          ruta_archivo_red?: string | null
          sucursal_origen?: string | null
          tiene_pdf_adjunto?: boolean | null
          usuario_creador?: string | null
        }
        Update: {
          codigo_proveedor?: string | null
          concepto_detalle?: string | null
          estado_actual?: string
          factura_id?: number
          fecha_creacion_registro?: string | null
          fecha_emision?: string
          fecha_ultima_actualizacion?: string | null
          mes_periodo?: string | null
          monto_total?: number
          nombre_proveedor?: string
          numero_factura?: string
          origen_importacion?: string | null
          poliza_contable?: string | null
          poliza_contable2?: string | null
          porcentaje_progreso?: number | null
          ruta_archivo_red?: string | null
          sucursal_origen?: string | null
          tiene_pdf_adjunto?: boolean | null
          usuario_creador?: string | null
        }
        Relationships: []
      }
      pmat_facturas_recibidas: {
        Row: {
          codigo_proveedor: string
          estado_actual: string
          factura_id: number
          fecha_creacion_registro: string | null
          fecha_emision: string
          fecha_ultima_actualizacion: string | null
          folio_recepcion: string | null
          monto_total: number
          nombre_proveedor: string
          numero_factura: string
          origen_importacion: string | null
          porcentaje_progreso: number | null
          sucursal_origen: string | null
          tiene_pdf_adjunto: boolean | null
          usuario_creador: string | null
        }
        Insert: {
          codigo_proveedor: string
          estado_actual?: string
          factura_id?: number
          fecha_creacion_registro?: string | null
          fecha_emision: string
          fecha_ultima_actualizacion?: string | null
          folio_recepcion?: string | null
          monto_total: number
          nombre_proveedor: string
          numero_factura: string
          origen_importacion?: string | null
          porcentaje_progreso?: number | null
          sucursal_origen?: string | null
          tiene_pdf_adjunto?: boolean | null
          usuario_creador?: string | null
        }
        Update: {
          codigo_proveedor?: string
          estado_actual?: string
          factura_id?: number
          fecha_creacion_registro?: string | null
          fecha_emision?: string
          fecha_ultima_actualizacion?: string | null
          folio_recepcion?: string | null
          monto_total?: number
          nombre_proveedor?: string
          numero_factura?: string
          origen_importacion?: string | null
          porcentaje_progreso?: number | null
          sucursal_origen?: string | null
          tiene_pdf_adjunto?: boolean | null
          usuario_creador?: string | null
        }
        Relationships: []
      }
      productivity_metrics: {
        Row: {
          badges: Json | null
          created_at: string | null
          engagement: number | null
          id: string
          overall_score: number | null
          period_end: string
          period_start: string
          quality_score: number | null
          reliability: number | null
          tasks_completed: number | null
          tasks_late: number | null
          tasks_on_time: number | null
          updated_at: string | null
          user_id: string | null
          velocity: number | null
        }
        Insert: {
          badges?: Json | null
          created_at?: string | null
          engagement?: number | null
          id?: string
          overall_score?: number | null
          period_end: string
          period_start: string
          quality_score?: number | null
          reliability?: number | null
          tasks_completed?: number | null
          tasks_late?: number | null
          tasks_on_time?: number | null
          updated_at?: string | null
          user_id?: string | null
          velocity?: number | null
        }
        Update: {
          badges?: Json | null
          created_at?: string | null
          engagement?: number | null
          id?: string
          overall_score?: number | null
          period_end?: string
          period_start?: string
          quality_score?: number | null
          reliability?: number | null
          tasks_completed?: number | null
          tasks_late?: number | null
          tasks_on_time?: number | null
          updated_at?: string | null
          user_id?: string | null
          velocity?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string
          full_name: string
          id: string
          role: string
          updated_at: string | null
          whatsapp_enabled: boolean | null
          whatsapp_phone: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email: string
          full_name: string
          id?: string
          role: string
          updated_at?: string | null
          whatsapp_enabled?: boolean | null
          whatsapp_phone?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string
          full_name?: string
          id?: string
          role?: string
          updated_at?: string | null
          whatsapp_enabled?: boolean | null
          whatsapp_phone?: string | null
        }
        Relationships: []
      }
      projects: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          end_date: string | null
          id: string
          name: string
          parent_id: string | null
          start_date: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          name: string
          parent_id?: string | null
          start_date?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          start_date?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      registros: {
        Row: {
          bloque_horario_id: number | null
          empleado_id: number
          fecha_hora: string
          foto_registro: string | null
          id: number
          latitud: number | null
          longitud: number | null
          observaciones: string | null
          origen: string | null
          qr_code: string | null
          tablet_id: string | null
          tipo_registro: string
        }
        Insert: {
          bloque_horario_id?: number | null
          empleado_id: number
          fecha_hora?: string
          foto_registro?: string | null
          id?: number
          latitud?: number | null
          longitud?: number | null
          observaciones?: string | null
          origen?: string | null
          qr_code?: string | null
          tablet_id?: string | null
          tipo_registro: string
        }
        Update: {
          bloque_horario_id?: number | null
          empleado_id?: number
          fecha_hora?: string
          foto_registro?: string | null
          id?: number
          latitud?: number | null
          longitud?: number | null
          observaciones?: string | null
          origen?: string | null
          qr_code?: string | null
          tablet_id?: string | null
          tipo_registro?: string
        }
        Relationships: [
          {
            foreignKeyName: "registros_bloque_horario_id_fkey"
            columns: ["bloque_horario_id"]
            isOneToOne: false
            referencedRelation: "bloques_horario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registros_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "empleados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registros_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "v_asistencia_hoy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registros_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "v_empleados_completos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registros_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "vista_usuarios_completa"
            referencedColumns: ["empleado_id"]
          },
        ]
      }
      rnd_actividades: {
        Row: {
          datos_adicionales: Json | null
          descripcion: string
          fecha: string | null
          id: string
          tipo: string
          usuario: string | null
        }
        Insert: {
          datos_adicionales?: Json | null
          descripcion: string
          fecha?: string | null
          id?: string
          tipo: string
          usuario?: string | null
        }
        Update: {
          datos_adicionales?: Json | null
          descripcion?: string
          fecha?: string | null
          id?: string
          tipo?: string
          usuario?: string | null
        }
        Relationships: []
      }
      rnd_empleados: {
        Row: {
          activo: boolean | null
          codigo: string
          created_at: string | null
          id: string
          nombre: string
          sucursal: string | null
          telefono: string | null
          updated_at: string | null
        }
        Insert: {
          activo?: boolean | null
          codigo: string
          created_at?: string | null
          id?: string
          nombre: string
          sucursal?: string | null
          telefono?: string | null
          updated_at?: string | null
        }
        Update: {
          activo?: boolean | null
          codigo?: string
          created_at?: string | null
          id?: string
          nombre?: string
          sucursal?: string | null
          telefono?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      rnd_reembolsos: {
        Row: {
          archivos: Json | null
          autorizado_por: string | null
          concepto: string
          created_at: string | null
          documentos_adicionales: Json | null
          estado: string | null
          evidencia_entrega: Json | null
          fecha: string
          fecha_autorizacion: string | null
          fecha_entrega: string | null
          fecha_registro: string | null
          id: string
          monto: number
          motivo_rechazo: string | null
          nombre_beneficiario: string
          numero_lote: string | null
          numero_solicitud: string | null
          porcentaje_reembolso: string | null
          quien_autoriza: string | null
          quien_entrega: string | null
          sucursal_usuario: string | null
          updated_at: string | null
          usuario_registro: string | null
        }
        Insert: {
          archivos?: Json | null
          autorizado_por?: string | null
          concepto: string
          created_at?: string | null
          documentos_adicionales?: Json | null
          estado?: string | null
          evidencia_entrega?: Json | null
          fecha: string
          fecha_autorizacion?: string | null
          fecha_entrega?: string | null
          fecha_registro?: string | null
          id?: string
          monto: number
          motivo_rechazo?: string | null
          nombre_beneficiario: string
          numero_lote?: string | null
          numero_solicitud?: string | null
          porcentaje_reembolso?: string | null
          quien_autoriza?: string | null
          quien_entrega?: string | null
          sucursal_usuario?: string | null
          updated_at?: string | null
          usuario_registro?: string | null
        }
        Update: {
          archivos?: Json | null
          autorizado_por?: string | null
          concepto?: string
          created_at?: string | null
          documentos_adicionales?: Json | null
          estado?: string | null
          evidencia_entrega?: Json | null
          fecha?: string
          fecha_autorizacion?: string | null
          fecha_entrega?: string | null
          fecha_registro?: string | null
          id?: string
          monto?: number
          motivo_rechazo?: string | null
          nombre_beneficiario?: string
          numero_lote?: string | null
          numero_solicitud?: string | null
          porcentaje_reembolso?: string | null
          quien_autoriza?: string | null
          quien_entrega?: string | null
          sucursal_usuario?: string | null
          updated_at?: string | null
          usuario_registro?: string | null
        }
        Relationships: []
      }
      rnd_usuarios: {
        Row: {
          activo: boolean | null
          created_at: string | null
          email: string
          fecha_creacion: string | null
          id: string
          nombre: string
          password: string
          rol: string
          sucursal: string
          updated_at: string | null
        }
        Insert: {
          activo?: boolean | null
          created_at?: string | null
          email: string
          fecha_creacion?: string | null
          id?: string
          nombre: string
          password: string
          rol: string
          sucursal: string
          updated_at?: string | null
        }
        Update: {
          activo?: boolean | null
          created_at?: string | null
          email?: string
          fecha_creacion?: string | null
          id?: string
          nombre?: string
          password?: string
          rol?: string
          sucursal?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      sucursales: {
        Row: {
          actualizado_en: string | null
          actualizado_por: string | null
          geocerca_activa: boolean | null
          id: number
          latitud: number | null
          longitud: number | null
          nombre: string
          radio_metros: number | null
        }
        Insert: {
          actualizado_en?: string | null
          actualizado_por?: string | null
          geocerca_activa?: boolean | null
          id?: number
          latitud?: number | null
          longitud?: number | null
          nombre: string
          radio_metros?: number | null
        }
        Update: {
          actualizado_en?: string | null
          actualizado_por?: string | null
          geocerca_activa?: boolean | null
          id?: number
          latitud?: number | null
          longitud?: number | null
          nombre?: string
          radio_metros?: number | null
        }
        Relationships: []
      }
      tablet_access_codes: {
        Row: {
          activo: boolean | null
          codigo: string
          created_at: string | null
          descripcion: string | null
          id: number
          nombre: string | null
          tablet_id: string
          updated_at: string | null
        }
        Insert: {
          activo?: boolean | null
          codigo: string
          created_at?: string | null
          descripcion?: string | null
          id?: number
          nombre?: string | null
          tablet_id: string
          updated_at?: string | null
        }
        Update: {
          activo?: boolean | null
          codigo?: string
          created_at?: string | null
          descripcion?: string | null
          id?: number
          nombre?: string | null
          tablet_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      tablets: {
        Row: {
          activo: boolean
          bloqueado_en: string | null
          bloqueado_motivo: string | null
          codigo: string
          created_at: string
          id: number
          nombre: string
          sucursal_codigo: string | null
          tablet_id: string
          ultimo_uso: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          bloqueado_en?: string | null
          bloqueado_motivo?: string | null
          codigo: string
          created_at?: string
          id?: number
          nombre: string
          sucursal_codigo?: string | null
          tablet_id: string
          ultimo_uso?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          bloqueado_en?: string | null
          bloqueado_motivo?: string | null
          codigo?: string
          created_at?: string
          id?: number
          nombre?: string
          sucursal_codigo?: string | null
          tablet_id?: string
          ultimo_uso?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      task_dependencies: {
        Row: {
          created_at: string | null
          depends_on_id: string | null
          id: string
          task_id: string | null
        }
        Insert: {
          created_at?: string | null
          depends_on_id?: string | null
          id?: string
          task_id?: string | null
        }
        Update: {
          created_at?: string | null
          depends_on_id?: string | null
          id?: string
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_dependencies_depends_on_id_fkey"
            columns: ["depends_on_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_dependencies_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_files: {
        Row: {
          created_at: string | null
          download_url: string | null
          file_id: string
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          is_deleted: boolean | null
          mime_type: string | null
          task_id: string
          uploaded_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string | null
          download_url?: string | null
          file_id: string
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          is_deleted?: boolean | null
          mime_type?: string | null
          task_id: string
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string | null
          download_url?: string | null
          file_id?: string
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          is_deleted?: boolean | null
          mime_type?: string | null
          task_id?: string
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: []
      }
      tasks: {
        Row: {
          actual_hours: number | null
          assigned_to: string | null
          budget: number | null
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          due_date: string | null
          ease: number | null
          enthusiasm: number | null
          estimated_hours: number | null
          id: string
          impact: number | null
          importance: number | null
          is_milestone: boolean | null
          parent_id: string | null
          priority_score: number | null
          project_id: string | null
          recurrence_interval: number | null
          recurrence_type: string | null
          requested_by: string | null
          start_date: string | null
          status: string | null
          tags: string[] | null
          title: string
          updated_at: string | null
          urgency: number | null
        }
        Insert: {
          actual_hours?: number | null
          assigned_to?: string | null
          budget?: number | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          ease?: number | null
          enthusiasm?: number | null
          estimated_hours?: number | null
          id?: string
          impact?: number | null
          importance?: number | null
          is_milestone?: boolean | null
          parent_id?: string | null
          priority_score?: number | null
          project_id?: string | null
          recurrence_interval?: number | null
          recurrence_type?: string | null
          requested_by?: string | null
          start_date?: string | null
          status?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string | null
          urgency?: number | null
        }
        Update: {
          actual_hours?: number | null
          assigned_to?: string | null
          budget?: number | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          ease?: number | null
          enthusiasm?: number | null
          estimated_hours?: number | null
          id?: string
          impact?: number | null
          importance?: number | null
          is_milestone?: boolean | null
          parent_id?: string | null
          priority_score?: number | null
          project_id?: string | null
          recurrence_interval?: number | null
          recurrence_type?: string | null
          requested_by?: string | null
          start_date?: string | null
          status?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string | null
          urgency?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      usuarios_sistema: {
        Row: {
          contrasena_hash: string
          correo_electronico: string
          cuenta_activa: boolean | null
          fecha_alta_sistema: string | null
          nombre_completo: string
          rol_asignado: string | null
          sucursal_asignada: string | null
          ultimo_acceso: string | null
          usuario_id: number
        }
        Insert: {
          contrasena_hash: string
          correo_electronico: string
          cuenta_activa?: boolean | null
          fecha_alta_sistema?: string | null
          nombre_completo: string
          rol_asignado?: string | null
          sucursal_asignada?: string | null
          ultimo_acceso?: string | null
          usuario_id?: number
        }
        Update: {
          contrasena_hash?: string
          correo_electronico?: string
          cuenta_activa?: boolean | null
          fecha_alta_sistema?: string | null
          nombre_completo?: string
          rol_asignado?: string | null
          sucursal_asignada?: string | null
          ultimo_acceso?: string | null
          usuario_id?: number
        }
        Relationships: []
      }
      usuarios_sucursal: {
        Row: {
          activo: boolean | null
          created_at: string | null
          empleado_id: number | null
          id: number
          nombre_completo: string
          password_hash: string
          rol: string | null
          sucursal: string
          ultimo_acceso: string | null
          updated_at: string | null
          username: string
        }
        Insert: {
          activo?: boolean | null
          created_at?: string | null
          empleado_id?: number | null
          id?: number
          nombre_completo: string
          password_hash: string
          rol?: string | null
          sucursal: string
          ultimo_acceso?: string | null
          updated_at?: string | null
          username: string
        }
        Update: {
          activo?: boolean | null
          created_at?: string | null
          empleado_id?: number | null
          id?: number
          nombre_completo?: string
          password_hash?: string
          rol?: string | null
          sucursal?: string
          ultimo_acceso?: string | null
          updated_at?: string | null
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuarios_sucursal_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "empleados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuarios_sucursal_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "v_asistencia_hoy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuarios_sucursal_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "v_empleados_completos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuarios_sucursal_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "vista_usuarios_completa"
            referencedColumns: ["empleado_id"]
          },
        ]
      }
      weekly_meeting_templates: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          participants: Json
          project_id: string | null
          room: string | null
          section_durations: Json
          time: string | null
          weekday: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          participants?: Json
          project_id?: string | null
          room?: string | null
          section_durations?: Json
          time?: string | null
          weekday: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          participants?: Json
          project_id?: string | null
          room?: string | null
          section_durations?: Json
          time?: string | null
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "weekly_meeting_templates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_asistencia_hoy: {
        Row: {
          apellido: string | null
          codigo_empleado: string | null
          fecha_hora: string | null
          id: number | null
          nombre: string | null
          puesto: string | null
          sucursal: string | null
          tipo_registro: string | null
        }
        Relationships: []
      }
      v_dist_eficiencia: {
        Row: {
          anio: number | null
          facturas: number | null
          r_0_4h: number | null
          r_12_16h: number | null
          r_16_20h: number | null
          r_20_24h: number | null
          r_24_36h: number | null
          r_36h_plus: number | null
          r_4_8h: number | null
          r_8_12h: number | null
          score_eficiencia: number | null
          semana: string | null
        }
        Relationships: []
      }
      v_dist_semana: {
        Row: {
          anio: number | null
          cd_total: number | null
          costo_dist: number | null
          facturas: number | null
          horas_prom: number | null
          importe_total: number | null
          km_totales: number | null
          pct_ub: number | null
          pct_ub_cd: number | null
          r_0_4h: number | null
          r_12_16h: number | null
          r_16_20h: number | null
          r_20_24h: number | null
          r_24_36h: number | null
          r_36h_plus: number | null
          r_4_8h: number | null
          r_8_12h: number | null
          semana: string | null
          toneladas: number | null
          ub_total: number | null
        }
        Relationships: []
      }
      v_empleados_completos: {
        Row: {
          activo: boolean | null
          apellido: string | null
          codigo_empleado: string | null
          fecha_alta: string | null
          foto_perfil: string | null
          horario_id: number | null
          id: number | null
          nombre: string | null
          nombre_horario: string | null
          puesto: string | null
          sucursal: string | null
          total_registros: number | null
          trabaja_domingo: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "empleados_horario_id_fkey"
            columns: ["horario_id"]
            isOneToOne: false
            referencedRelation: "horarios"
            referencedColumns: ["id"]
          },
        ]
      }
      vista_usuarios_completa: {
        Row: {
          activo: boolean | null
          codigo_empleado: string | null
          created_at: string | null
          empleado_apellido: string | null
          empleado_id: number | null
          empleado_nombre: string | null
          empleado_nombre_completo: string | null
          id: number | null
          nombre_completo: string | null
          puesto: string | null
          rol: string | null
          sucursal: string | null
          ultimo_acceso: string | null
          username: string | null
        }
        Relationships: []
      }
      vista_usuarios_por_sucursal: {
        Row: {
          admins: number | null
          gerentes: number | null
          sucursal: string | null
          total_usuarios: number | null
          ultimo_acceso_sucursal: string | null
          usuarios_activos: number | null
          usuarios_inactivos: number | null
          usuarios_normales: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      es_admin: { Args: { p_usuario_id: number }; Returns: boolean }
      get_empleado_nombre_completo: {
        Args: { p_empleado_id: number }
        Returns: string
      }
      get_project_stats: { Args: { project_uuid: string }; Returns: Json }
      get_project_subtree_ids: {
        Args: { root_id: string }
        Returns: {
          id: string
        }[]
      }
      get_room_summary: {
        Args: { p_room: string }
        Returns: {
          meeting_kind: string
          room: string
          status: string
          title: string
        }[]
      }
      get_template_room_summary: {
        Args: { p_room: string }
        Returns: {
          name: string
          room: string
        }[]
      }
      get_user_pending_tasks: {
        Args: { user_uuid: string }
        Returns: {
          due_date: string
          id: string
          priority_score: number
          project_name: string
          title: string
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      is_room_admitted: { Args: { p_room: string }; Returns: boolean }
      is_room_host: { Args: { p_room: string }; Returns: boolean }
      is_supervisor: { Args: never; Returns: boolean }
      meeting_agenda_patch: {
        Args: { p_path: string[]; p_room: string; p_value: Json }
        Returns: Json
      }
      obtener_usuarios_activos_sucursal: {
        Args: { p_sucursal: string }
        Returns: {
          id: number
          nombre_completo: string
          rol: string
          ultimo_acceso: string
          username: string
        }[]
      }
      productivity_ranking: {
        Args: never
        Returns: {
          avatar_url: string
          completed_count: number
          email: string
          full_name: string
          user_id: string
        }[]
      }
      validar_registro_empleado: {
        Args: {
          p_empleado_id: number
          p_fecha_hora?: string
          p_tipo_registro: string
        }
        Returns: {
          mensaje: string
          valido: boolean
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
