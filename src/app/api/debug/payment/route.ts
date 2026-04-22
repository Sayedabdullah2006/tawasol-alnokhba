/**
 * Debug endpoint for testing payment verification
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

    const supabase = await createServiceRoleClient();

    // First, get the current request
    console.log(`[DEBUG] Getting request ${requestId}...`);
    const { data: currentRequest, error: fetchError } = await supabase
      .from('publish_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (fetchError) {
      console.error('[DEBUG] Error fetching request:', fetchError);
      return NextResponse.json({
        error: 'Failed to fetch request',
        details: fetchError.message
      }, { status: 500 });
    }

    console.log('[DEBUG] Current request:', currentRequest);

    // Now try to update the status
    console.log(`[DEBUG] Updating request ${requestId} status to 'in_progress'...`);
    const { data: updateData, error: updateError } = await supabase
      .from('publish_requests')
      .update({
        status: 'in_progress',
        updated_at: new Date().toISOString()
      })
      .eq('id', requestId)
      .select();

    if (updateError) {
      console.error('[DEBUG] Update error:', updateError);
      return NextResponse.json({
        error: 'Failed to update request',
        details: updateError.message,
        currentRequest
      }, { status: 500 });
    }

    console.log('[DEBUG] Update successful:', updateData);

    return NextResponse.json({
      success: true,
      message: 'Request status updated successfully',
      currentRequest,
      updatedRequest: updateData?.[0]
    });

  } catch (error) {
    console.error('[DEBUG] Exception:', error);
    return NextResponse.json({
      error: 'Server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}