/**
 * Direct status update endpoint for testing callback functionality
 * Only works in development
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase-server';

export async function POST(request: NextRequest) {
  // Only work in development
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  try {
    const { requestId } = await request.json();

    if (!requestId) {
      return NextResponse.json({ error: 'Request ID required' }, { status: 400 });
    }

    console.log('[DEBUG_DIRECT] Direct update request for:', requestId);
    const supabase = await createServiceRoleClient();

    const { data: updateData, error: updateError } = await supabase
      .from('publish_requests')
      .update({
        status: 'in_progress',
        updated_at: new Date().toISOString()
      })
      .eq('id', requestId)
      .select();

    if (updateError) {
      console.error('[DEBUG_DIRECT] Update failed:', updateError);
      return NextResponse.json({
        success: false,
        error: 'Failed to update status',
        details: updateError.message
      }, { status: 500 });
    }

    console.log('[DEBUG_DIRECT] Update successful:', updateData);

    return NextResponse.json({
      success: true,
      message: 'Status updated directly',
      updatedRequest: updateData?.[0]
    });

  } catch (error) {
    console.error('[DEBUG_DIRECT] Exception:', error);
    return NextResponse.json({
      error: 'Server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}